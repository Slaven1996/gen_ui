import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AUTO_INTERVAL_MAX_POINTS,
  SERIES_INTERVAL_MS,
  SERIES_INTERVALS,
  type IngestMeasurementsDto,
  type IngestResult,
  type SeriesAggregate,
  type SeriesInterval,
  type TagStats,
  type TelemetrySeries,
  type TelemetrySeriesQuery,
  type TelemetryStatsQuery,
} from '@gen-ui/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { AlarmEvaluator, type Reading } from '../alarms/alarm-evaluator.service.js';
import { assetRefSelect } from '../assets/asset.mapper.js';
import { DevicesService } from '../assets/devices.service.js';
import { requiredWindow } from '../../common/list-query.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';

/** Refuse queries that would return more buckets than any chart can draw. */
const MAX_BUCKETS_PER_SERIES = 5000;

const POSTGRES_INTERVAL: Record<Exclude<SeriesInterval, '1d'>, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '1h': '1 hour',
  '6h': '6 hours',
};

const AGGREGATE_SQL: Record<SeriesAggregate, Prisma.Sql> = {
  avg: Prisma.sql`avg(m.value)`,
  min: Prisma.sql`min(m.value)`,
  max: Prisma.sql`max(m.value)`,
  sum: Prisma.sql`sum(m.value)`,
  last: Prisma.sql`(array_agg(m.value ORDER BY m.ts DESC))[1]`,
};

/** The smallest bucket that keeps the series under the auto point budget. */
export function autoInterval(spanMs: number): SeriesInterval {
  return (
    SERIES_INTERVALS.find((interval) => spanMs / SERIES_INTERVAL_MS[interval] <= AUTO_INTERVAL_MAX_POINTS) ?? '1d'
  );
}

@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly evaluator: AlarmEvaluator,
    private readonly devices: DevicesService,
  ) {}

  /**
   * Readings bucketed and aggregated in the database, so a 90-day chart moves
   * a few hundred points instead of a hundred thousand. Day buckets follow
   * `timeZone`, so a "day" starts at local midnight.
   */
  async series(query: TelemetrySeriesQuery): Promise<TelemetrySeries> {
    const { from, to } = requiredWindow(query);
    const span = to.getTime() - from.getTime();
    const interval = query.interval === 'auto' ? autoInterval(span) : query.interval;
    if (span / SERIES_INTERVAL_MS[interval] > MAX_BUCKETS_PER_SERIES) {
      throw new BadRequestException(`\`${interval}\` is too fine for this range; choose a larger interval or \`auto\``);
    }

    const tagIds = query.tagIds ?? [];
    const tags = tagIds.length
      ? await this.prisma.tag.findMany({
          where: { id: { in: tagIds } },
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            minValue: true,
            maxValue: true,
            device: { select: { asset: { select: assetRefSelect } } },
          },
        })
      : [];

    const bucket =
      interval === '1d'
        ? Prisma.sql`date_trunc('day', m.ts, ${query.timeZone})`
        : Prisma.sql`date_bin(${POSTGRES_INTERVAL[interval]}::interval, m.ts, TIMESTAMPTZ '2000-01-01 00:00:00+00')`;

    const rows = tags.length
      ? await this.prisma.$queryRaw<Array<{ tag_id: string; bucket: Date; v: number | null }>>`
          SELECT m.tag_id, ${bucket} AS bucket, ${AGGREGATE_SQL[query.aggregate]}::float8 AS v
          FROM measurements m
          WHERE m.tag_id = ANY(${tags.map((tag) => tag.id)}::uuid[])
            AND m.ts >= ${from.toISOString()}::timestamptz
            AND m.ts < ${to.toISOString()}::timestamptz
            AND m.quality <> 'BAD'
          GROUP BY m.tag_id, bucket
          ORDER BY m.tag_id, bucket`
      : [];

    const pointsByTag = new Map<string, Array<{ t: string; v: number | null }>>();
    for (const row of rows) {
      const points = pointsByTag.get(row.tag_id) ?? [];
      points.push({ t: new Date(row.bucket).toISOString(), v: row.v });
      pointsByTag.set(row.tag_id, points);
    }

    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      interval,
      aggregate: query.aggregate,
      // Keep the order the caller asked for; drop ids that do not exist.
      series: tagIds.flatMap((id) => {
        const tag = byId.get(id);
        if (!tag) return [];
        const { device, ...ref } = tag;
        return [{ tag: { ...ref, asset: device.asset }, points: pointsByTag.get(id) ?? [] }];
      }),
    };
  }

  async stats(query: TelemetryStatsQuery): Promise<TagStats[]> {
    const tagIds = query.tagIds ?? [];
    if (tagIds.length === 0) return [];
    const { from, to } = requiredWindow(query);

    const rows = await this.prisma.$queryRaw<
      Array<{
        tag_id: string;
        count: number;
        min: number | null;
        max: number | null;
        avg: number | null;
        first: number | null;
        last: number | null;
        last_at: Date | null;
      }>
    >`
      SELECT tag_id,
             count(*)::int AS count,
             min(value) AS min,
             max(value) AS max,
             avg(value)::float8 AS avg,
             (array_agg(value ORDER BY ts ASC))[1] AS first,
             (array_agg(value ORDER BY ts DESC))[1] AS last,
             max(ts) AS last_at
      FROM measurements
      WHERE tag_id = ANY(${tagIds}::uuid[])
        AND ts >= ${from.toISOString()}::timestamptz
        AND ts < ${to.toISOString()}::timestamptz
        AND quality <> 'BAD'
      GROUP BY tag_id`;

    const byTag = new Map(rows.map((row) => [row.tag_id, row]));
    return tagIds.map((tagId) => {
      const row = byTag.get(tagId);
      return {
        tagId,
        count: row?.count ?? 0,
        min: row?.min ?? null,
        max: row?.max ?? null,
        avg: row?.avg ?? null,
        first: row?.first ?? null,
        last: row?.last ?? null,
        lastAt: row?.last_at ? new Date(row.last_at).toISOString() : null,
      };
    });
  }

  /**
   * Stores readings, moves each tag's latest value forward, marks reporting
   * devices online and evaluates alarm rules — all in one transaction.
   *
   * Only readings newer than a tag's latest value are evaluated: late or
   * back-filled data is stored for the charts but never re-raises an alarm.
   */
  async ingest(dto: IngestMeasurementsDto): Promise<IngestResult> {
    const tagIds = [...new Set(dto.measurements.map((m) => m.tagId))];
    const tags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds } },
      select: { id: true, lastValueAt: true, deviceId: true },
    });
    const unknown = tagIds.filter((id) => !tags.some((tag) => tag.id === id));
    if (unknown.length > 0) throw new BadRequestException(`Unknown tag(s): ${unknown.join(', ')}`);

    const now = new Date();
    const readings = dto.measurements.map((m) => ({
      tagId: m.tagId,
      ts: m.ts ? new Date(m.ts) : now,
      value: m.value,
      quality: m.quality,
    }));

    return this.uow.run(async (tx) => {
      const { count } = await tx.measurement.createMany({ data: readings, skipDuplicates: true });

      const latest = new Map<string, (typeof readings)[number]>();
      for (const reading of readings) {
        if (reading.quality === 'BAD') continue;
        const current = latest.get(reading.tagId);
        if (!current || reading.ts > current.ts) latest.set(reading.tagId, reading);
      }
      for (const reading of latest.values()) {
        await tx.tag.updateMany({
          where: { id: reading.tagId, OR: [{ lastValueAt: null }, { lastValueAt: { lte: reading.ts } }] },
          data: { lastValue: reading.value, lastValueAt: reading.ts },
        });
      }

      const deviceIds = [...new Set(tags.map((tag) => tag.deviceId))];
      const waking = await tx.device.findMany({
        where: { id: { in: deviceIds }, status: 'OFFLINE' },
        select: { id: true, name: true, assetId: true },
      });
      await tx.device.updateMany({ where: { id: { in: deviceIds } }, data: { lastSeenAt: now } });
      if (waking.length > 0) {
        await tx.device.updateMany({ where: { id: { in: waking.map((device) => device.id) } }, data: { status: 'ONLINE' } });
        for (const device of waking) {
          await this.devices.recordStatusChange(device.name, device.assetId, 'OFFLINE', 'ONLINE', tx);
        }
      }

      const lastSeen = new Map(tags.map((tag) => [tag.id, tag.lastValueAt]));
      const fresh: Reading[] = readings.filter((reading) => {
        const previous = lastSeen.get(reading.tagId);
        return reading.quality !== 'BAD' && (!previous || reading.ts > previous);
      });
      const { raised, cleared } = await this.evaluator.evaluate(fresh, tx);

      return { accepted: count, alarmsRaised: raised, alarmsCleared: cleared };
    });
  }
}
