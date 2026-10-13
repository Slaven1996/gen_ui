import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateLogbookEntryDto,
  ListLogbookQuery,
  LogbookCategory,
  LogbookEntry,
  LogSeverity,
  Paginated,
  UpdateLogbookEntryDto,
} from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AlarmSummary } from '../alarms/alarm-notifications.js';
import { assetRefSelect } from '../assets/asset.mapper.js';
import { diff, AuditService } from '../audit/audit.service.js';
import { insensitive, iso, orderBy, pageArgs, timeWindow, toPaginated, withinAsset } from '../../common/list-query.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../../prisma/transaction.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { newEntryNotification } from './logbook-notifications.js';

const entrySelect = {
  id: true,
  category: true,
  severity: true,
  title: true,
  body: true,
  occurredAt: true,
  alarmId: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  asset: { select: assetRefSelect },
  author: { select: { id: true, name: true } },
} as const satisfies Prisma.LogbookEntrySelect;

type EntryRecord = Prisma.LogbookEntryGetPayload<{ select: typeof entrySelect }>;

const toEntry = (row: EntryRecord): LogbookEntry => ({
  id: row.id,
  category: row.category,
  severity: row.severity,
  title: row.title,
  body: row.body,
  occurredAt: iso(row.occurredAt),
  asset: row.asset,
  alarmId: row.alarmId,
  author: row.author,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

/** One of a person's own entries in the assistant's pick list: enough to recognise it by, and its id. */
export interface EntryOption {
  id: string;
  occurredAt: string;
  category: LogbookCategory;
  title: string;
  asset: string | null;
}

/** What the system writes: alarm transitions, device status changes. */
export interface SystemEvent {
  category: LogbookCategory;
  severity: LogSeverity;
  title: string;
  body?: string | null;
  assetId?: string | null;
  alarmId?: string | null;
  occurredAt?: Date;
}

@Injectable()
export class LogbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListLogbookQuery): Promise<Paginated<LogbookEntry>> {
    const window = timeWindow(query);
    const where: Prisma.LogbookEntryWhereInput = {
      ...(query.search && { OR: [{ title: insensitive(query.search) }, { body: insensitive(query.search) }] }),
      ...(query.category && { category: { in: query.category } }),
      ...(query.severity && { severity: { in: query.severity } }),
      ...(query.source === 'user' && { authorId: { not: null } }),
      ...(query.source === 'system' && { authorId: null }),
      ...(query.assetId && { asset: withinAsset(query.assetId) }),
      ...(query.alarmId && { alarmId: query.alarmId }),
      ...(query.authorId && { authorId: { in: query.authorId } }),
      ...(window && { occurredAt: window }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.logbookEntry.findMany({
        where,
        select: entrySelect,
        orderBy: orderBy(query.sort, {
          occurredAt: (direction) => ({ occurredAt: direction }),
          severity: (direction) => ({ severity: direction }),
          category: (direction) => ({ category: direction }),
        }),
        ...pageArgs(query),
      }),
      this.prisma.logbookEntry.count({ where }),
    ]);
    return toPaginated(rows.map(toEntry), total, query);
  }

  /**
   * The latest `take` entries `authorId` wrote, newest first: the ones they
   * may edit (only an entry's author can), as the choices the assistant
   * matches the user's words against when a tool asks for an entry's id.
   */
  async options(authorId: string, take: number): Promise<EntryOption[]> {
    const rows = await this.prisma.logbookEntry.findMany({
      where: { authorId },
      select: { id: true, occurredAt: true, category: true, title: true, asset: { select: { name: true } } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      take,
    });
    return rows.map(({ occurredAt, asset, ...entry }) => ({ ...entry, occurredAt: iso(occurredAt), asset: asset?.name ?? null }));
  }

  async get(id: string): Promise<LogbookEntry> {
    const row = await this.prisma.logbookEntry.findUnique({ where: { id }, select: entrySelect });
    if (!row) throw new NotFoundException('Logbook entry not found');
    return toEntry(row);
  }

  /**
   * Writes a person's entry. Everyone else is notified of a note on an alarm,
   * and of any other entry that is a warning or critical one.
   */
  async create(dto: CreateLogbookEntryDto, actor: AuthUser): Promise<LogbookEntry> {
    let assetId = dto.assetId;
    let alarm: AlarmSummary | null = null;
    if (dto.alarmId) {
      const found = await this.prisma.alarm.findUnique({
        where: { id: dto.alarmId },
        select: { assetId: true, severity: true, asset: { select: assetRefSelect }, definition: { select: { name: true } } },
      });
      if (!found) throw new BadRequestException('Alarm not found');
      assetId ??= found.assetId;
      alarm = { id: dto.alarmId, severity: found.severity, rule: found.definition.name, asset: found.asset };
    }
    if (assetId && !(await this.prisma.asset.count({ where: { id: assetId } }))) {
      throw new BadRequestException('Asset not found');
    }

    const { row, addressed } = await this.uow.run(async (tx) => {
      const entry = await tx.logbookEntry.create({
        data: {
          category: dto.category,
          severity: dto.severity,
          title: dto.title,
          body: dto.body,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          assetId,
          alarmId: dto.alarmId,
          authorId: actor.id,
        },
        select: entrySelect,
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'logbook.create',
          entityType: 'LOGBOOK_ENTRY',
          entityId: entry.id,
          summary: `Wrote ${dto.category.toLowerCase()} “${dto.title}”`,
        },
        tx,
      );
      const notification = newEntryNotification(entry, alarm, actor.name);
      return {
        row: entry,
        addressed: notification ? await this.notifications.createForActiveUsers([notification], tx, actor.id) : [],
      };
    });
    this.notifications.push(addressed);
    return toEntry(row);
  }

  async update(id: string, dto: UpdateLogbookEntryDto, actor: AuthUser): Promise<LogbookEntry> {
    const current = await this.prisma.logbookEntry.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Logbook entry not found');
    if (current.authorId !== actor.id) throw new ForbiddenException('Only the author can edit an entry');
    if (dto.assetId && !(await this.prisma.asset.count({ where: { id: dto.assetId } }))) {
      throw new BadRequestException('Asset not found');
    }

    const { occurredAt, ...fields } = dto;
    const row = await this.uow.run(async (tx) => {
      const entry = await tx.logbookEntry.update({
        where: { id },
        data: { ...fields, ...(occurredAt && { occurredAt: new Date(occurredAt) }) },
        select: entrySelect,
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'logbook.update',
          entityType: 'LOGBOOK_ENTRY',
          entityId: id,
          summary: `Edited logbook entry “${entry.title}”`,
          changes: diff(current, dto),
        },
        tx,
      );
      return entry;
    });
    return toEntry(row);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const entry = await this.prisma.logbookEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Logbook entry not found');
    if (entry.authorId === null) throw new ForbiddenException('System events cannot be deleted');
    if (entry.authorId !== actor.id && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Only the author or an admin can delete an entry');
    }

    await this.uow.run(async (tx) => {
      await tx.logbookEntry.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'logbook.delete',
          entityType: 'LOGBOOK_ENTRY',
          entityId: id,
          summary: `Deleted logbook entry “${entry.title}”`,
        },
        tx,
      );
    });
  }

  /** Called by other modules, inside their own transaction. */
  async recordEvent(event: SystemEvent, db: Db = this.prisma): Promise<void> {
    await db.logbookEntry.create({
      data: {
        category: event.category,
        severity: event.severity,
        title: event.title,
        body: event.body ?? null,
        assetId: event.assetId ?? null,
        alarmId: event.alarmId ?? null,
        occurredAt: event.occurredAt ?? new Date(),
      },
    });
  }
}
