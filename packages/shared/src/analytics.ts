import { z } from 'zod';
import { ALARM_SEVERITIES, type AlarmSeverity } from './alarms.js';
import { DEVICE_STATUSES } from './assets.js';
import { csvEnum, itemsSchema, requiredTimeRangeParams, timeZoneParam } from './common/query.js';

const countsBy = <T extends readonly [string, ...string[]]>(keys: T) =>
  z.object(Object.fromEntries(keys.map((key) => [key, z.int()])) as { [K in T[number]]: z.ZodInt });

// ─── Summary (KPIs) ─────────────────────────────────────────────────────────

export const AnalyticsScopeQuerySchema = z.object({
  assetId: z.guid().optional().describe('Limit every figure to this asset and everything below it.'),
});
export type AnalyticsScopeQuery = z.output<typeof AnalyticsScopeQuerySchema>;

export const AnalyticsSummarySchema = z
  .object({
    assets: z.int(),
    tags: z.int(),
    devices: z.object({ total: z.int(), byStatus: countsBy(DEVICE_STATUSES) }),
    alarms: z.object({
      open: z.int().describe('ACTIVE, ACKNOWLEDGED or CLEARED.'),
      active: z.int().describe('Condition still present (ACTIVE or ACKNOWLEDGED).'),
      unacknowledged: z.int().describe('ACTIVE or CLEARED.'),
      openBySeverity: countsBy(ALARM_SEVERITIES),
      raisedLast24h: z.int(),
      mttaMinutes: z
        .number()
        .nullable()
        .describe('Mean time to acknowledge, alarms raised in the last 7 days. `null` when none were acknowledged.'),
    }),
  })
  .meta({ id: 'AnalyticsSummary' });
export type AnalyticsSummary = z.infer<typeof AnalyticsSummarySchema>;

/** Single figures a KPI widget can show, each read from the summary. */
export const KPI_METRICS = [
  'OPEN_ALARMS',
  'ACTIVE_ALARMS',
  'UNACKNOWLEDGED_ALARMS',
  'CRITICAL_ALARMS',
  'ALARMS_LAST_24H',
  'MTTA',
  'DEVICES_ONLINE',
  'DEVICES_OFFLINE',
  'ASSETS',
  'TAGS',
] as const;
export const KpiMetricSchema = z.enum(KPI_METRICS);
export type KpiMetric = z.infer<typeof KpiMetricSchema>;

// ─── Alarm trend ────────────────────────────────────────────────────────────

export const TREND_INTERVALS = ['hour', 'day', 'week'] as const;
export const TrendIntervalSchema = z.enum(TREND_INTERVALS);
export type TrendInterval = z.infer<typeof TrendIntervalSchema>;

export const alarmTrendParams = {
  ...requiredTimeRangeParams('7d'),
  interval: TrendIntervalSchema.default('day'),
  severity: csvEnum(ALARM_SEVERITIES),
  assetId: z.guid().optional().describe('Alarms on this asset or anywhere below it.'),
};

export const AlarmTrendQuerySchema = z.object({ ...alarmTrendParams, timeZone: timeZoneParam() });
export type AlarmTrendQueryInput = z.input<typeof AlarmTrendQuerySchema>;
export type AlarmTrendQuery = z.output<typeof AlarmTrendQuerySchema>;

export const AlarmTrendBucketSchema = z.object({
  t: z.iso.datetime().describe('Bucket start.'),
  total: z.int(),
  ...countsBy(ALARM_SEVERITIES).shape,
});
export type AlarmTrendBucket = z.infer<typeof AlarmTrendBucketSchema> & Record<AlarmSeverity, number>;

export const AlarmTrendSchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    interval: TrendIntervalSchema,
    buckets: z.array(AlarmTrendBucketSchema).describe('Alarms raised per bucket, by severity. Empty buckets included.'),
  })
  .meta({ id: 'AlarmTrend' });
export type AlarmTrend = z.infer<typeof AlarmTrendSchema>;

// ─── Top alarms ("bad actors") ──────────────────────────────────────────────

export const TOP_ALARMS_GROUPINGS = ['definition', 'asset'] as const;

export const topAlarmsParams = {
  ...requiredTimeRangeParams('30d'),
  groupBy: z.enum(TOP_ALARMS_GROUPINGS).default('definition').describe('Rank rules, or the assets they fire on.'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  assetId: z.guid().optional().describe('Alarms on this asset or anywhere below it.'),
};

export const TopAlarmsQuerySchema = z.object(topAlarmsParams);
export type TopAlarmsQueryInput = z.input<typeof TopAlarmsQuerySchema>;
export type TopAlarmsQuery = z.output<typeof TopAlarmsQuerySchema>;

export const TopAlarmsItemSchema = z.object({
  id: z.guid().describe('Rule id or asset id, depending on `groupBy`.'),
  name: z.string(),
  detail: z.string().nullable().describe('The asset of a rule, or the type of an asset.'),
  count: z.int(),
  lastRaisedAt: z.iso.datetime(),
});
export type TopAlarmsItem = z.infer<typeof TopAlarmsItemSchema>;

export const TopAlarmsSchema = itemsSchema(TopAlarmsItemSchema).meta({ id: 'TopAlarms' });
