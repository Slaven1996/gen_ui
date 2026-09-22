import { Injectable } from '@nestjs/common';
import {
  ALARM_SEVERITIES,
  DEVICE_STATUSES,
  OPEN_ALARM_STATES,
  type AlarmSeverity,
  type AlarmTrend,
  type AlarmTrendBucket,
  type AlarmTrendQuery,
  type AnalyticsScopeQuery,
  type AnalyticsSummary,
  type DeviceStatus,
  type TopAlarmsItem,
  type TopAlarmsQuery,
} from '@gen-ui/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { iso, requiredWindow, timeWindow, withinAsset } from '../../common/list-query.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const DAY_MS = 86_400_000;

/**
 * `alarms` timestamps are stored as UTC `timestamp` (Prisma's default), so an
 * instant is compared as `timestamptz AT TIME ZONE 'UTC'`.
 */
const utc = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

const assetPathFilter = (assetId: string | undefined) =>
  assetId ? Prisma.sql`AND s.path LIKE ${`%/${assetId}/%`}` : Prisma.empty;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary({ assetId }: AnalyticsScopeQuery): Promise<AnalyticsSummary> {
    const scope = assetId ? withinAsset(assetId) : undefined;
    // Devices and alarms both reach the tree through their `asset` relation.
    const viaAsset = scope ? { asset: scope } : {};
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);

    const [assets, tags, devices, openAlarms, raisedLast24h, [mtta]] = await Promise.all([
      this.prisma.asset.count({ where: scope ?? {} }),
      this.prisma.tag.count({ where: scope ? { device: { asset: scope } } : {} }),
      this.prisma.device.groupBy({ by: ['status'], where: viaAsset, _count: { _all: true } }),
      this.prisma.alarm.groupBy({
        by: ['state', 'severity'],
        where: { state: { in: [...OPEN_ALARM_STATES] }, ...viaAsset },
        _count: { _all: true },
      }),
      this.prisma.alarm.count({ where: { raisedAt: { gte: new Date(Date.now() - DAY_MS) }, ...viaAsset } }),
      this.prisma.$queryRaw<Array<{ minutes: number | null }>>`
        SELECT (extract(epoch FROM avg(a.acknowledged_at - a.raised_at)) / 60)::float8 AS minutes
        FROM alarms a JOIN assets s ON s.id = a.asset_id
        WHERE a.acknowledged_at IS NOT NULL AND a.raised_at >= ${utc(weekAgo)} ${assetPathFilter(assetId)}`,
    ]);

    const byStatus = Object.fromEntries(DEVICE_STATUSES.map((status) => [status, 0])) as Record<DeviceStatus, number>;
    for (const group of devices) byStatus[group.status] = group._count._all;

    const openBySeverity = Object.fromEntries(ALARM_SEVERITIES.map((severity) => [severity, 0])) as Record<
      AlarmSeverity,
      number
    >;
    let open = 0;
    let active = 0;
    let unacknowledged = 0;
    for (const group of openAlarms) {
      const count = group._count._all;
      open += count;
      openBySeverity[group.severity] += count;
      if (group.state === 'ACTIVE' || group.state === 'ACKNOWLEDGED') active += count;
      if (group.state === 'ACTIVE' || group.state === 'CLEARED') unacknowledged += count;
    }

    return {
      assets,
      tags,
      devices: { total: devices.reduce((sum, group) => sum + group._count._all, 0), byStatus },
      alarms: {
        open,
        active,
        unacknowledged,
        openBySeverity,
        raisedLast24h,
        mttaMinutes: mtta?.minutes === null || mtta?.minutes === undefined ? null : Math.round(mtta.minutes * 10) / 10,
      },
    };
  }

  /**
   * Alarms raised per bucket and severity. Buckets are generated in SQL in the
   * caller's time zone (PostgreSQL 16+ `generate_series(…, timezone)`), so a
   * "day" starts at local midnight across DST changes, and empty ones are kept.
   */
  async alarmTrend(query: AlarmTrendQuery): Promise<AlarmTrend> {
    const { from, to } = requiredWindow(query);
    const unit = query.interval;
    const step = `1 ${unit}`;
    const severityFilter = query.severity?.length
      ? Prisma.sql`AND a.severity::text = ANY(${query.severity}::text[])`
      : Prisma.empty;

    const counts = ALARM_SEVERITIES.map(
      (severity) => Prisma.sql`count(a.raised_at) FILTER (WHERE a.severity::text = ${severity})::int AS ${Prisma.raw(`"${severity}"`)}`,
    );

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown> & { t: Date; total: number }>>`
      SELECT b.t, count(a.raised_at)::int AS total, ${Prisma.join(counts)}
      FROM generate_series(
        date_trunc(${unit}, ${from.toISOString()}::timestamptz, ${query.timeZone}),
        ${to.toISOString()}::timestamptz - interval '1 millisecond',
        ${step}::interval,
        ${query.timeZone}
      ) AS b(t)
      LEFT JOIN (
        SELECT a.raised_at, a.severity
        FROM alarms a JOIN assets s ON s.id = a.asset_id
        WHERE a.raised_at >= ${utc(from)} AND a.raised_at < ${utc(to)}
          ${severityFilter} ${assetPathFilter(query.assetId)}
      ) a ON date_trunc(${unit}, a.raised_at AT TIME ZONE 'UTC', ${query.timeZone}) = b.t
      GROUP BY b.t
      ORDER BY b.t`;

    return {
      from: iso(from),
      to: iso(to),
      interval: query.interval,
      buckets: rows.map((row) => {
        const bucket = { t: new Date(row.t).toISOString(), total: row.total } as AlarmTrendBucket;
        for (const severity of ALARM_SEVERITIES) bucket[severity] = Number(row[severity] ?? 0);
        return bucket;
      }),
    };
  }

  /** The rules (or assets) that fired most often: where alarm load comes from. */
  async topAlarms(query: TopAlarmsQuery): Promise<TopAlarmsItem[]> {
    const where: Prisma.AlarmWhereInput = {
      raisedAt: timeWindow(query),
      ...(query.assetId && { asset: withinAsset(query.assetId) }),
    };

    if (query.groupBy === 'asset') {
      const groups = await this.prisma.alarm.groupBy({
        by: ['assetId'],
        where,
        _count: { _all: true },
        _max: { raisedAt: true },
        orderBy: [{ _count: { assetId: 'desc' } }, { assetId: 'asc' }],
        take: query.limit,
      });
      const assets = await this.prisma.asset.findMany({
        where: { id: { in: groups.map((group) => group.assetId) } },
        select: { id: true, name: true, type: true },
      });
      const byId = new Map(assets.map((asset) => [asset.id, asset]));
      return groups.map((group) => ({
        id: group.assetId,
        name: byId.get(group.assetId)?.name ?? 'Unknown asset',
        detail: byId.get(group.assetId)?.type ?? null,
        count: group._count._all,
        lastRaisedAt: iso(group._max.raisedAt!),
      }));
    }

    const groups = await this.prisma.alarm.groupBy({
      by: ['definitionId'],
      where,
      _count: { _all: true },
      _max: { raisedAt: true },
      orderBy: [{ _count: { definitionId: 'desc' } }, { definitionId: 'asc' }],
      take: query.limit,
    });
    const definitions = await this.prisma.alarmDefinition.findMany({
      where: { id: { in: groups.map((group) => group.definitionId) } },
      select: { id: true, name: true, tag: { select: { device: { select: { asset: { select: { name: true } } } } } } },
    });
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    return groups.map((group) => {
      const definition = byId.get(group.definitionId);
      return {
        id: group.definitionId,
        name: definition?.name ?? 'Deleted rule',
        detail: definition?.tag.device.asset.name ?? null,
        count: group._count._all,
        lastRaisedAt: iso(group._max.raisedAt!),
      };
    });
  }
}
