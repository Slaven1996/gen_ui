import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  UNACKNOWLEDGED_ALARM_STATES,
  type AcknowledgeResult,
  type Alarm,
  type AlarmState,
  type ListAlarmsQuery,
  type Paginated,
} from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { assetRefSelect } from '../assets/asset.mapper.js';
import { AuditService, type AuditEntry } from '../audit/audit.service.js';
import { insensitive, nullsLast, orderBy, pageArgs, timeWindow, toPaginated, withinAsset } from '../../common/list-query.js';
import { LogbookService } from '../logbook/logbook.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { alarmSelect, toAlarm } from './alarm.mapper.js';
import { acknowledgedNotification, clearedNotification, type AlarmSummary } from './alarm-notifications.js';

/** Acknowledging keeps "is the condition present" and adds "someone has seen it". */
const ACKNOWLEDGED_STATE: Partial<Record<AlarmState, AlarmState>> = {
  ACTIVE: 'ACKNOWLEDGED',
  CLEARED: 'CLOSED',
};

/** Clearing by hand keeps "has someone seen it" and ends the condition. */
const CLEARED_STATE: Partial<Record<AlarmState, AlarmState>> = {
  ACTIVE: 'CLEARED',
  ACKNOWLEDGED: 'CLOSED',
};

@Injectable()
export class AlarmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly logbook: LogbookService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListAlarmsQuery): Promise<Paginated<Alarm>> {
    const window = timeWindow(query);
    const where: Prisma.AlarmWhereInput = {
      ...(query.search && {
        OR: [
          { message: insensitive(query.search) },
          { definition: { name: insensitive(query.search) } },
          { tag: { name: insensitive(query.search) } },
        ],
      }),
      ...(query.state && { state: { in: query.state } }),
      ...(query.severity && { severity: { in: query.severity } }),
      ...(query.assetId && { asset: withinAsset(query.assetId) }),
      ...(query.tagId && { tagId: query.tagId }),
      ...(query.definitionId && { definitionId: { in: query.definitionId } }),
      ...(query.acknowledged !== undefined && {
        acknowledgedAt: query.acknowledged ? { not: null } : null,
      }),
      ...(window && { raisedAt: window }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alarm.findMany({
        where,
        select: alarmSelect,
        orderBy: orderBy(query.sort, {
          raisedAt: (direction) => ({ raisedAt: direction }),
          // Enum order is declaration order: CRITICAL sorts first ascending.
          severity: (direction) => ({ severity: direction }),
          state: (direction) => ({ state: direction }),
          clearedAt: (direction) => ({ clearedAt: nullsLast(direction) }),
          acknowledgedAt: (direction) => ({ acknowledgedAt: nullsLast(direction) }),
        }),
        ...pageArgs(query),
      }),
      this.prisma.alarm.count({ where }),
    ]);
    return toPaginated(rows.map(toAlarm), total, query);
  }

  async get(id: string): Promise<Alarm> {
    const row = await this.prisma.alarm.findUnique({ where: { id }, select: alarmSelect });
    if (!row) throw new NotFoundException('Alarm not found');
    return toAlarm(row);
  }

  async acknowledge(id: string, note: string | undefined, actor: AuthUser): Promise<Alarm> {
    const exists = await this.prisma.alarm.count({ where: { id } });
    if (!exists) throw new NotFoundException('Alarm not found');

    const { acknowledged } = await this.acknowledgeMany([id], note, actor);
    if (acknowledged === 0) throw new ConflictException('This alarm is already acknowledged');
    return this.get(id);
  }

  /**
   * Acknowledges every listed alarm that still needs it. Each row changes only
   * if it is still in the state we read, so a concurrent acknowledgement or
   * clear is never overwritten, and nobody is credited twice. Everyone else
   * gets one notification about what this acknowledged.
   */
  async acknowledgeMany(ids: string[], note: string | undefined, actor: AuthUser): Promise<AcknowledgeResult> {
    const { result, addressed } = await this.uow.run(async (tx) => {
      const candidates = await tx.alarm.findMany({
        where: { id: { in: ids }, state: { in: [...UNACKNOWLEDGED_ALARM_STATES] } },
        select: {
          id: true,
          state: true,
          severity: true,
          message: true,
          assetId: true,
          asset: { select: assetRefSelect },
          definition: { select: { name: true } },
        },
      });

      const now = new Date();
      const audit: AuditEntry[] = [];
      const acknowledged: AlarmSummary[] = [];
      for (const alarm of candidates) {
        const { count } = await tx.alarm.updateMany({
          where: { id: alarm.id, state: alarm.state },
          data: {
            state: ACKNOWLEDGED_STATE[alarm.state]!,
            acknowledgedAt: now,
            acknowledgedById: actor.id,
            acknowledgeNote: note ?? null,
          },
        });
        if (count === 0) continue;

        await this.logbook.recordEvent(
          {
            category: 'ALARM',
            severity: 'INFO',
            title: `Alarm acknowledged: ${alarm.definition.name}`,
            body: `Acknowledged by ${actor.name}${note ? `: ${note}` : '.'}`,
            assetId: alarm.assetId,
            alarmId: alarm.id,
            occurredAt: now,
          },
          tx,
        );
        audit.push({
          actorId: actor.id,
          action: 'alarm.acknowledge',
          entityType: 'ALARM',
          entityId: alarm.id,
          summary: `Acknowledged “${alarm.message}”`,
          changes: { state: { from: alarm.state, to: ACKNOWLEDGED_STATE[alarm.state] }, ...(note && { note }) },
        });
        acknowledged.push({ id: alarm.id, severity: alarm.severity, rule: alarm.definition.name, asset: alarm.asset });
      }
      await this.audit.recordMany(audit, tx);
      const notification = acknowledgedNotification(acknowledged, actor.name, note);
      return {
        result: { acknowledged: audit.length, skipped: ids.length - audit.length },
        addressed: notification ? await this.notifications.createForActiveUsers([notification], tx, actor.id) : [],
      };
    });
    this.notifications.push(addressed);
    return result;
  }

  /**
   * Ends the condition by hand, e.g. after a sensor fault or when the device
   * stopped reporting. Everyone else is notified.
   */
  async clear(id: string, actor: AuthUser): Promise<Alarm> {
    const alarm = await this.prisma.alarm.findUnique({
      where: { id },
      select: {
        state: true,
        severity: true,
        message: true,
        assetId: true,
        asset: { select: assetRefSelect },
        definition: { select: { name: true } },
      },
    });
    if (!alarm) throw new NotFoundException('Alarm not found');
    const next = CLEARED_STATE[alarm.state];
    if (!next) throw new ConflictException('This alarm is already cleared');

    const addressed = await this.uow.run(async (tx) => {
      const { count } = await tx.alarm.updateMany({
        where: { id, state: alarm.state },
        data: { state: next, clearedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('The alarm changed meanwhile; reload and try again');

      await this.logbook.recordEvent(
        {
          category: 'ALARM',
          severity: 'INFO',
          title: `Alarm cleared manually: ${alarm.definition.name}`,
          body: `Cleared by ${actor.name}.`,
          assetId: alarm.assetId,
          alarmId: id,
        },
        tx,
      );
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'alarm.clear',
          entityType: 'ALARM',
          entityId: id,
          summary: `Cleared “${alarm.message}” by hand`,
          changes: { state: { from: alarm.state, to: next } },
        },
        tx,
      );
      const summary = { id, severity: alarm.severity, rule: alarm.definition.name, asset: alarm.asset };
      return this.notifications.createForActiveUsers([clearedNotification(summary, actor.name)], tx, actor.id);
    });
    this.notifications.push(addressed);
    return this.get(id);
  }
}
