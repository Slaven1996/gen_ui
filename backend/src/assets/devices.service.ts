import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDeviceDto,
  Device,
  DeviceStatus,
  ListDevicesQuery,
  Paginated,
  UpdateDeviceDto,
} from '@gen-ui/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { insensitive, nullsLast, orderBy, pageArgs, toPaginated, withinAsset } from '../common/list-query.js';
import { LogbookService } from '../logbook/logbook.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/transaction.js';
import { UnitOfWork } from '../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { deviceSelect, toDevice } from './asset.mapper.js';

const STATUS_SEVERITY: Record<DeviceStatus, 'INFO' | 'WARNING' | 'CRITICAL'> = {
  ONLINE: 'INFO',
  MAINTENANCE: 'INFO',
  OFFLINE: 'WARNING',
  FAULT: 'CRITICAL',
};

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly logbook: LogbookService,
  ) {}

  async list(query: ListDevicesQuery): Promise<Paginated<Device>> {
    const where: Prisma.DeviceWhereInput = {
      ...(query.search && {
        OR: [
          { name: insensitive(query.search) },
          { serialNumber: insensitive(query.search) },
          { model: insensitive(query.search) },
          { manufacturer: insensitive(query.search) },
        ],
      }),
      ...(query.status && { status: { in: query.status } }),
      ...(query.protocol && { protocol: { in: query.protocol } }),
      ...(query.assetId && { asset: withinAsset(query.assetId) }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({
        where,
        select: deviceSelect,
        orderBy: orderBy(query.sort, {
          name: (direction) => ({ name: direction }),
          serialNumber: (direction) => ({ serialNumber: direction }),
          status: (direction) => ({ status: direction }),
          lastSeenAt: (direction) => ({ lastSeenAt: nullsLast(direction) }),
          createdAt: (direction) => ({ createdAt: direction }),
        }),
        ...pageArgs(query),
      }),
      this.prisma.device.count({ where }),
    ]);
    return toPaginated(rows.map(toDevice), total, query);
  }

  async get(id: string): Promise<Device> {
    const row = await this.prisma.device.findUnique({ where: { id }, select: deviceSelect });
    if (!row) throw new NotFoundException('Device not found');
    return toDevice(row);
  }

  async create(dto: CreateDeviceDto, actor: AuthUser): Promise<Device> {
    await this.assertAsset(dto.assetId);
    const row = await this.uow.run(async (tx) => {
      const device = await tx.device.create({
        data: { ...dto, installedAt: dto.installedAt ? new Date(dto.installedAt) : null },
        select: deviceSelect,
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'device.create',
          entityType: 'DEVICE',
          entityId: device.id,
          summary: `Added device ${device.name} (${device.serialNumber}) to ${device.asset.name}`,
          changes: { serialNumber: dto.serialNumber, assetId: dto.assetId, protocol: dto.protocol },
        },
        tx,
      );
      return device;
    });
    return toDevice(row);
  }

  async update(id: string, dto: UpdateDeviceDto, actor: AuthUser): Promise<Device> {
    const current = await this.prisma.device.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Device not found');
    if (dto.assetId) await this.assertAsset(dto.assetId);

    const { installedAt, ...fields } = dto;
    const row = await this.uow.run(async (tx) => {
      const device = await tx.device.update({
        where: { id },
        data: {
          ...fields,
          ...(installedAt !== undefined && { installedAt: installedAt ? new Date(installedAt) : null }),
        },
        select: deviceSelect,
      });
      if (dto.status && dto.status !== current.status) {
        await this.recordStatusChange(device.name, device.assetId, current.status, dto.status, tx, actor);
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'device.update',
          entityType: 'DEVICE',
          entityId: id,
          summary: `Updated device ${device.name} (${device.serialNumber})`,
          changes: diff(current, dto),
        },
        tx,
      );
      return device;
    });
    return toDevice(row);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const device = await this.prisma.device.findUnique({
      where: { id },
      select: { name: true, serialNumber: true, _count: { select: { tags: true } } },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (device._count.tags > 0) throw new ConflictException('Delete its tags first');

    await this.uow.run(async (tx) => {
      await tx.device.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'device.delete',
          entityType: 'DEVICE',
          entityId: id,
          summary: `Deleted device ${device.name} (${device.serialNumber})`,
        },
        tx,
      );
    });
  }

  /** A status change is operational news, so it also goes in the logbook. */
  async recordStatusChange(
    name: string,
    assetId: string,
    from: DeviceStatus,
    to: DeviceStatus,
    db: Db,
    actor?: AuthUser,
  ): Promise<void> {
    await this.logbook.recordEvent(
      {
        category: 'DEVICE',
        severity: STATUS_SEVERITY[to],
        title: `${name} is ${to.toLowerCase()}`,
        body: `Status changed from ${from.toLowerCase()} to ${to.toLowerCase()}${actor ? ` by ${actor.name}` : ''}.`,
        assetId,
      },
      db,
    );
  }

  private async assertAsset(assetId: string): Promise<void> {
    const exists = await this.prisma.asset.count({ where: { id: assetId } });
    if (!exists) throw new BadRequestException('Asset not found');
  }
}
