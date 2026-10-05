import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTagDto, ListTagsQuery, Paginated, Tag, UpdateTagDto } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { insensitive, nullsLast, orderBy, pageArgs, toPaginated, withinAsset } from '../../common/list-query.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { tagSelect, toTag } from './asset.mapper.js';

/** One tag in the assistant's pick list: enough to recognise it by, and its id. */
export interface TagOption {
  id: string;
  name: string;
  code: string;
  unit: string | null;
  asset: string;
}

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListTagsQuery): Promise<Paginated<Tag>> {
    const where: Prisma.TagWhereInput = {
      ...(query.search && {
        OR: [{ name: insensitive(query.search) }, { code: insensitive(query.search) }, { unit: insensitive(query.search) }],
      }),
      ...(query.ids && { id: { in: query.ids } }),
      ...(query.deviceId && { deviceId: query.deviceId }),
      ...(query.assetId && { device: { asset: withinAsset(query.assetId) } }),
      ...(query.dataType && { dataType: { in: query.dataType } }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tag.findMany({
        where,
        select: tagSelect,
        orderBy: orderBy(query.sort, {
          name: (direction) => ({ name: direction }),
          code: (direction) => ({ code: direction }),
          lastValueAt: (direction) => ({ lastValueAt: nullsLast(direction) }),
          createdAt: (direction) => ({ createdAt: direction }),
        }),
        ...pageArgs(query),
      }),
      this.prisma.tag.count({ where }),
    ]);
    return toPaginated(rows.map(toTag), total, query);
  }

  /**
   * Every tag, grouped by where it is: the choices the assistant matches the
   * user's words against when a tool asks for a tag's id (the tag pickers'
   * options, all at once).
   */
  async options(): Promise<TagOption[]> {
    const rows = await this.prisma.tag.findMany({
      select: { id: true, name: true, code: true, unit: true, device: { select: { asset: { select: { name: true } } } } },
      orderBy: [{ device: { asset: { name: 'asc' } } }, { name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ device, ...tag }) => ({ ...tag, asset: device.asset.name }));
  }

  async get(id: string): Promise<Tag> {
    const row = await this.prisma.tag.findUnique({ where: { id }, select: tagSelect });
    if (!row) throw new NotFoundException('Tag not found');
    return toTag(row);
  }

  async create(dto: CreateTagDto, actor: AuthUser): Promise<Tag> {
    const device = await this.prisma.device.count({ where: { id: dto.deviceId } });
    if (!device) throw new BadRequestException('Device not found');

    const row = await this.uow.run(async (tx) => {
      const tag = await tx.tag.create({ data: dto, select: tagSelect });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'tag.create',
          entityType: 'TAG',
          entityId: tag.id,
          summary: `Added tag ${tag.name} (${tag.code}) on ${tag.device.name}`,
          changes: { code: dto.code, deviceId: dto.deviceId, dataType: dto.dataType, unit: dto.unit },
        },
        tx,
      );
      return tag;
    });
    return toTag(row);
  }

  async update(id: string, dto: UpdateTagDto, actor: AuthUser): Promise<Tag> {
    const current = await this.prisma.tag.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Tag not found');

    const minValue = dto.minValue !== undefined ? dto.minValue : current.minValue;
    const maxValue = dto.maxValue !== undefined ? dto.maxValue : current.maxValue;
    if (minValue !== null && maxValue !== null && minValue >= maxValue) {
      throw new BadRequestException('Minimum must be below maximum');
    }

    const row = await this.uow.run(async (tx) => {
      const tag = await tx.tag.update({ where: { id }, data: dto, select: tagSelect });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'tag.update',
          entityType: 'TAG',
          entityId: id,
          summary: `Updated tag ${tag.name} (${tag.code})`,
          changes: diff(current, dto),
        },
        tx,
      );
      return tag;
    });
    return toTag(row);
  }

  /** Measurements go with the tag; alarm history does not, so tags with rules or alarms are kept. */
  async remove(id: string, actor: AuthUser): Promise<void> {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      select: { name: true, code: true, _count: { select: { alarmDefinitions: true, alarms: true } } },
    });
    if (!tag) throw new NotFoundException('Tag not found');
    if (tag._count.alarmDefinitions > 0 || tag._count.alarms > 0) {
      throw new ConflictException('This tag has alarm rules or alarm history. Deactivate it instead.');
    }

    await this.uow.run(async (tx) => {
      await tx.tag.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'tag.delete',
          entityType: 'TAG',
          entityId: id,
          summary: `Deleted tag ${tag.name} (${tag.code})`,
        },
        tx,
      );
    });
  }
}
