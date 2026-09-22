import { z } from 'zod';
import { AssetRefSchema, TagRefSchema } from './assets.js';
import { csvIds, itemsSchema, requiredTimeRangeParams, timeZoneParam } from './common/query.js';

export const SERIES_INTERVALS = ['1m', '5m', '15m', '1h', '6h', '1d'] as const;
export const SeriesIntervalSchema = z.enum(SERIES_INTERVALS);
export type SeriesInterval = z.infer<typeof SeriesIntervalSchema>;

export const SERIES_INTERVAL_MS: Record<SeriesInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '6h': 21_600_000,
  '1d': 86_400_000,
};

/** How many points `interval=auto` aims to stay under, per series. */
export const AUTO_INTERVAL_MAX_POINTS = 400;

export const SERIES_AGGREGATES = ['avg', 'min', 'max', 'sum', 'last'] as const;
export const SeriesAggregateSchema = z.enum(SERIES_AGGREGATES);
export type SeriesAggregate = z.infer<typeof SeriesAggregateSchema>;

export const CHART_TYPES = ['line', 'area', 'bar', 'step'] as const;
export const ChartTypeSchema = z.enum(CHART_TYPES);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const MEASUREMENT_QUALITIES = ['GOOD', 'UNCERTAIN', 'BAD'] as const;
export const MeasurementQualitySchema = z.enum(MEASUREMENT_QUALITIES);
export type MeasurementQuality = z.infer<typeof MeasurementQualitySchema>;

export const MAX_SERIES_TAGS = 8;

/** Parameters that select data. `chartType` is presentation only and not sent to the API. */
export const seriesParams = {
  tagIds: csvIds(`Tags to plot, at most ${MAX_SERIES_TAGS}.`, MAX_SERIES_TAGS),
  ...requiredTimeRangeParams('24h'),
  interval: z
    .union([z.literal('auto'), SeriesIntervalSchema])
    .default('auto')
    .describe(`Bucket width. \`auto\` keeps each series under ${AUTO_INTERVAL_MAX_POINTS} points.`),
  aggregate: SeriesAggregateSchema.default('avg').describe('How values inside one bucket are combined.'),
};

export const TelemetrySeriesQuerySchema = z.object({
  ...seriesParams,
  timeZone: timeZoneParam(),
});
export type TelemetrySeriesQueryInput = z.input<typeof TelemetrySeriesQuerySchema>;
export type TelemetrySeriesQuery = z.output<typeof TelemetrySeriesQuerySchema>;

export const SeriesTagSchema = TagRefSchema.extend({
  asset: AssetRefSchema,
  minValue: z.number().nullable(),
  maxValue: z.number().nullable(),
}).meta({ id: 'SeriesTag' });
export type SeriesTag = z.infer<typeof SeriesTagSchema>;

export const SeriesPointSchema = z.object({
  t: z.iso.datetime().describe('Bucket start.'),
  v: z.number().nullable(),
});
export type SeriesPoint = z.infer<typeof SeriesPointSchema>;

export const TelemetrySeriesSchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    interval: SeriesIntervalSchema.describe('The resolved bucket width.'),
    aggregate: SeriesAggregateSchema,
    series: z.array(z.object({ tag: SeriesTagSchema, points: z.array(SeriesPointSchema) })),
  })
  .meta({ id: 'TelemetrySeries' });
export type TelemetrySeries = z.infer<typeof TelemetrySeriesSchema>;

export const TelemetryStatsQuerySchema = z.object({
  tagIds: seriesParams.tagIds,
  ...requiredTimeRangeParams('24h'),
});
export type TelemetryStatsQueryInput = z.input<typeof TelemetryStatsQuerySchema>;
export type TelemetryStatsQuery = z.output<typeof TelemetryStatsQuerySchema>;

export const TagStatsSchema = z
  .object({
    tagId: z.guid(),
    count: z.int(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    avg: z.number().nullable(),
    first: z.number().nullable(),
    last: z.number().nullable(),
    lastAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'TagStats' });
export type TagStats = z.infer<typeof TagStatsSchema>;

export const TelemetryStatsSchema = itemsSchema(TagStatsSchema).meta({ id: 'TelemetryStats' });

export const IngestMeasurementsSchema = z
  .object({
    measurements: z
      .array(
        z.object({
          tagId: z.guid(),
          ts: z.iso.datetime({ offset: true }).optional().describe('Defaults to the time of the request.'),
          value: z.number(),
          quality: MeasurementQualitySchema.default('GOOD'),
        }),
      )
      .min(1)
      .max(1000),
  })
  .meta({ id: 'IngestMeasurements' });
export type IngestMeasurementsDto = z.output<typeof IngestMeasurementsSchema>;

export const IngestResultSchema = z
  .object({
    accepted: z.int(),
    alarmsRaised: z.int(),
    alarmsCleared: z.int(),
  })
  .meta({ id: 'IngestResult' });
export type IngestResult = z.infer<typeof IngestResultSchema>;
