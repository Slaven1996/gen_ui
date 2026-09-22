import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OPEN_ALARM_STATES,
  type Asset,
  type AssetDetail,
  type AssetTreeNode,
  type CreateAssetDto,
  type ListAssetsQuery,
  type Paginated,
  type UpdateAssetDto,
} from '@gen-ui/shared';
import { Prisma } from '../generated/prisma/client.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { insensitive, orderBy, pageArgs, toPaginated, withinAsset } from '../common/list-query.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UnitOfWork } from '../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { assetRefSelect, assetSelect, pathIds, toAsset, toAssetDetail } from './asset.mapper.js';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAssetsQuery): Promise<Paginated<Asset>> {
    const where: Prisma.AssetWhereInput = {
      ...(query.search && { OR: [{ name: insensitive(query.search) }, { code: insensitive(query.search) }] }),
      ...(query.type && { type: { in: query.type } }),
      ...(query.parentId && { parentId: query.parentId }),
      ...(query.rootsOnly && { parentId: null }),
      ...(query.ancestorId && withinAsset(query.ancestorId)),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        select: assetSelect,
        orderBy: orderBy(query.sort, {
          name: (direction) => ({ name: direction }),
          code: (direction) => ({ code: direction }),
          type: (direction) => ({ type: direction }),
          createdAt: (direction) => ({ createdAt: direction }),
        }),
        ...pageArgs(query),
      }),
      this.prisma.asset.count({ where }),
    ]);
    return toPaginated(rows.map(toAsset), total, query);
  }

  /** The whole tree, depth-first with siblings by name, and open alarms rolled up to every ancestor. */
  async tree(): Promise<AssetTreeNode[]> {
    const [assets, openAlarms] = await Promise.all([
      this.prisma.asset.findMany({
        select: { id: true, parentId: true, path: true, code: true, name: true, type: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.alarm.groupBy({
        by: ['assetId'],
        where: { state: { in: [...OPEN_ALARM_STATES] } },
        _count: { _all: true },
      }),
    ]);

    const pathById = new Map(assets.map((asset) => [asset.id, asset.path]));
    const openCount = new Map<string, number>();
    for (const group of openAlarms) {
      const path = pathById.get(group.assetId);
      if (!path) continue;
      for (const ancestorId of pathIds(path)) {
        openCount.set(ancestorId, (openCount.get(ancestorId) ?? 0) + group._count._all);
      }
    }

    const childrenOf = new Map<string | null, typeof assets>();
    for (const asset of assets) {
      const siblings = childrenOf.get(asset.parentId) ?? [];
      siblings.push(asset);
      childrenOf.set(asset.parentId, siblings);
    }

    const nodes: AssetTreeNode[] = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const asset of childrenOf.get(parentId) ?? []) {
        nodes.push({
          id: asset.id,
          parentId: asset.parentId,
          code: asset.code,
          name: asset.name,
          type: asset.type,
          isActive: asset.isActive,
          depth,
          openAlarmCount: openCount.get(asset.id) ?? 0,
        });
        visit(asset.id, depth + 1);
      }
    };
    visit(null, 0);
    return nodes;
  }

  async get(id: string): Promise<AssetDetail> {
    const row = await this.prisma.asset.findUnique({ where: { id }, select: assetSelect });
    if (!row) throw new NotFoundException('Asset not found');

    const ancestorIds = pathIds(row.path).slice(0, -1);
    const ancestors = await this.prisma.asset.findMany({
      where: { id: { in: ancestorIds } },
      select: assetRefSelect,
    });
    const byId = new Map(ancestors.map((ancestor) => [ancestor.id, ancestor]));
    return toAssetDetail(
      row,
      ancestorIds.flatMap((ancestorId) => byId.get(ancestorId) ?? []),
    );
  }

  async create(dto: CreateAssetDto, actor: AuthUser): Promise<AssetDetail> {
    const parent = dto.parentId ? await this.findPath(dto.parentId, 'Parent asset not found') : null;
    const id = randomUUID();

    await this.uow.run(async (tx) => {
      await tx.asset.create({
        data: {
          id,
          path: `${parent?.path ?? '/'}${id}/`,
          parentId: dto.parentId,
          code: dto.code,
          name: dto.name,
          type: dto.type,
          description: dto.description,
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address,
          isActive: dto.isActive,
          metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'asset.create',
          entityType: 'ASSET',
          entityId: id,
          summary: `Created ${dto.type.toLowerCase()} ${dto.name} (${dto.code})`,
          changes: { code: dto.code, name: dto.name, type: dto.type, parentId: dto.parentId },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateAssetDto, actor: AuthUser): Promise<AssetDetail> {
    const current = await this.prisma.asset.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Asset not found');

    const moving = dto.parentId !== undefined && dto.parentId !== current.parentId;
    let newPath = current.path;
    if (moving) {
      const parent = dto.parentId ? await this.findPath(dto.parentId, 'Parent asset not found') : null;
      if (parent?.path.includes(`/${id}/`)) {
        throw new BadRequestException('An asset cannot be moved below itself');
      }
      newPath = `${parent?.path ?? '/'}${id}/`;
    }

    const { metadata, ...fields } = dto;
    await this.uow.run(async (tx) => {
      await tx.asset.update({
        where: { id },
        data: {
          ...fields,
          ...(metadata !== undefined && { metadata: metadata === null ? Prisma.DbNull : (metadata as Prisma.InputJsonValue) }),
          path: newPath,
        },
      });
      if (moving) {
        // Re-root every descendant: swap the old path prefix for the new one.
        await tx.$executeRaw`
          UPDATE assets
          SET path = ${newPath} || substring(path FROM ${current.path.length + 1})
          WHERE path LIKE ${`${current.path}%`} AND id <> ${id}::uuid`;
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: moving ? 'asset.move' : 'asset.update',
          entityType: 'ASSET',
          entityId: id,
          summary: `${moving ? 'Moved' : 'Updated'} ${dto.name ?? current.name} (${current.code})`,
          changes: diff(current, dto),
        },
        tx,
      );
    });
    return this.get(id);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      select: { name: true, code: true, _count: { select: { children: true, devices: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset._count.children > 0 || asset._count.devices > 0) {
      throw new ConflictException('Move or delete its child assets and devices first');
    }

    await this.uow.run(async (tx) => {
      await tx.asset.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'asset.delete',
          entityType: 'ASSET',
          entityId: id,
          summary: `Deleted ${asset.name} (${asset.code})`,
        },
        tx,
      );
    });
  }

  private async findPath(id: string, notFound: string): Promise<{ path: string }> {
    const asset = await this.prisma.asset.findUnique({ where: { id }, select: { path: true } });
    if (!asset) throw new BadRequestException(notFound);
    return asset;
  }
}
