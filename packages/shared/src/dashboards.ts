import { z } from 'zod';
import { alarmFilters } from './alarms.js';
import { alarmTrendParams, KpiMetricSchema, topAlarmsParams } from './analytics.js';
import { csvEnum, itemsSchema, nullableText, RelativeRangeSchema, searchParam, UserRefSchema } from './common/query.js';
import { logbookFilters } from './logbook.js';
import { SHIFT_ROLES } from './shifts.js';
import { ChartTypeSchema, MAX_SERIES_TAGS, seriesParams } from './telemetry.js';

/**
 * Widgets are the embeddable views of the app. Each widget's `config` is a
 * subset of the query its full page understands — the alarm table widget takes
 * `state`, `severity`, `assetId`… exactly like `GET /api/alarms` and the
 * `/alarms` URL do. That is what makes "View full page" a plain link, and it is
 * the shape a Generative UI tool will emit to render the same view in chat.
 */

export const WIDGET_TYPES = [
  'KPI',
  'TAG_VALUE',
  'TIME_SERIES',
  'ALARM_TABLE',
  'ALARM_TREND',
  'TOP_ALARMS',
  'LOGBOOK_FEED',
  'DEVICE_STATUS',
  'ON_DUTY',
] as const;
export const WidgetTypeSchema = z.enum(WIDGET_TYPES);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

/** Column spans on the 12-column dashboard grid. */
export const WIDGET_WIDTHS = [3, 4, 6, 8, 12] as const;
export const WidgetWidthSchema = z.union(WIDGET_WIDTHS.map((width) => z.literal(width)));
/** Row units (roughly 11rem each). */
export const WIDGET_HEIGHTS = [1, 2, 3] as const;
export const WidgetHeightSchema = z.union(WIDGET_HEIGHTS.map((height) => z.literal(height)));

const tableSize = z.coerce.number().int().min(3).max(20).default(5).describe('Rows shown.');

export const WIDGET_CONFIG_SCHEMAS = {
  KPI: z.object({
    metric: KpiMetricSchema,
    assetId: z.guid().optional(),
  }),
  TAG_VALUE: z.object({
    tagId: z.guid(),
    range: RelativeRangeSchema.default('24h').describe('Window of the sparkline.'),
  }),
  TIME_SERIES: z.object({
    tagIds: z.array(z.guid()).min(1, 'Pick at least one tag').max(MAX_SERIES_TAGS),
    range: seriesParams.range,
    interval: seriesParams.interval,
    aggregate: seriesParams.aggregate,
    chartType: ChartTypeSchema.default('line'),
  }),
  ALARM_TABLE: z.object({
    state: alarmFilters.state,
    severity: alarmFilters.severity,
    assetId: alarmFilters.assetId,
    range: alarmFilters.range,
    pageSize: tableSize,
  }),
  ALARM_TREND: z.object({
    range: alarmTrendParams.range,
    interval: alarmTrendParams.interval,
    severity: alarmTrendParams.severity,
    assetId: alarmTrendParams.assetId,
  }),
  TOP_ALARMS: z.object({
    range: topAlarmsParams.range,
    groupBy: topAlarmsParams.groupBy,
    limit: z.coerce.number().int().min(3).max(10).default(5),
    assetId: topAlarmsParams.assetId,
  }),
  LOGBOOK_FEED: z.object({
    category: logbookFilters.category,
    severity: logbookFilters.severity,
    source: logbookFilters.source,
    assetId: logbookFilters.assetId,
    pageSize: tableSize,
  }),
  DEVICE_STATUS: z.object({
    assetId: z.guid().optional(),
  }),
  ON_DUTY: z.object({
    role: csvEnum(SHIFT_ROLES),
  }),
} satisfies Record<WidgetType, z.ZodObject>;

export type WidgetConfig<T extends WidgetType = WidgetType> = z.output<(typeof WIDGET_CONFIG_SCHEMAS)[T]>;
export type WidgetConfigInput<T extends WidgetType = WidgetType> = z.input<(typeof WIDGET_CONFIG_SCHEMAS)[T]>;

export const WIDGET_DEFAULT_SIZE: Record<WidgetType, { width: (typeof WIDGET_WIDTHS)[number]; height: (typeof WIDGET_HEIGHTS)[number] }> = {
  KPI: { width: 3, height: 1 },
  TAG_VALUE: { width: 3, height: 1 },
  TIME_SERIES: { width: 8, height: 2 },
  ALARM_TABLE: { width: 8, height: 2 },
  ALARM_TREND: { width: 6, height: 2 },
  TOP_ALARMS: { width: 4, height: 2 },
  LOGBOOK_FEED: { width: 4, height: 2 },
  DEVICE_STATUS: { width: 4, height: 2 },
  ON_DUTY: { width: 4, height: 2 },
};

type ConfigSchemas = typeof WIDGET_CONFIG_SCHEMAS;

/** One `{ type, config }` object per widget type, joined into a discriminated union. */
function widgetUnion<Extra extends z.core.$ZodLooseShape>(extra: Extra) {
  const variants = WIDGET_TYPES.map((type) =>
    z.object({ type: z.literal(type), config: WIDGET_CONFIG_SCHEMAS[type], ...extra }),
  ) as unknown as {
    [K in WidgetType]: z.ZodObject<{ type: z.ZodLiteral<K>; config: ConfigSchemas[K] } & Extra>;
  }[WidgetType][];
  return z.discriminatedUnion('type', variants as [(typeof variants)[number], ...(typeof variants)[number][]]);
}

// ─── Widgets ────────────────────────────────────────────────────────────────

export const DashboardWidgetSchema = widgetUnion({
  id: z.guid(),
  dashboardId: z.guid(),
  title: z.string(),
  position: z.int().describe('Order on the grid, 0 first.'),
  width: WidgetWidthSchema,
  height: WidgetHeightSchema,
}).meta({ id: 'DashboardWidget' });
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;
export type DashboardWidgetOf<T extends WidgetType> = Extract<DashboardWidget, { type: T }>;

export const CreateWidgetSchema = widgetUnion({
  title: z.string().trim().min(1, 'Title is required').max(80),
  width: WidgetWidthSchema.optional().describe('Defaults by type.'),
  height: WidgetHeightSchema.optional().describe('Defaults by type.'),
}).meta({ id: 'CreateWidget' });
export type CreateWidgetInput = z.input<typeof CreateWidgetSchema>;
export type CreateWidgetDto = z.output<typeof CreateWidgetSchema>;

export const UpdateWidgetSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    width: WidgetWidthSchema,
    height: WidgetHeightSchema,
    config: z.record(z.string(), z.unknown()).describe('Validated against the widget’s type.'),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateWidget' });
export type UpdateWidgetDto = z.output<typeof UpdateWidgetSchema>;

export const UpdateLayoutSchema = z
  .object({
    widgets: z
      .array(
        z.object({
          id: z.guid(),
          position: z.int().min(0),
          width: WidgetWidthSchema,
          height: WidgetHeightSchema,
        }),
      )
      .max(50),
  })
  .describe('Every widget of the dashboard, in its new place. Widgets left out keep theirs.')
  .meta({ id: 'UpdateLayout' });
export type UpdateLayoutDto = z.output<typeof UpdateLayoutSchema>;

// ─── Dashboards ─────────────────────────────────────────────────────────────

export const DashboardSchema = z
  .object({
    id: z.guid(),
    name: z.string(),
    description: z.string().nullable(),
    isShared: z.boolean().describe('Visible (read-only) to every signed-in user.'),
    owner: UserRefSchema,
    canEdit: z.boolean().describe('Whether the caller may change it: its owner, or an admin.'),
    widgetCount: z.int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Dashboard' });
export type Dashboard = z.infer<typeof DashboardSchema>;

export const DashboardDetailSchema = DashboardSchema.extend({
  widgets: z.array(DashboardWidgetSchema),
}).meta({ id: 'DashboardDetail' });
export type DashboardDetail = z.infer<typeof DashboardDetailSchema>;

export const DashboardsSchema = itemsSchema(DashboardSchema).meta({ id: 'Dashboards' });

export const ListDashboardsQuerySchema = z.object({
  scope: z.enum(['all', 'mine', 'shared']).default('all'),
  search: searchParam('the name'),
});
export type ListDashboardsQueryInput = z.input<typeof ListDashboardsQuerySchema>;
export type ListDashboardsQuery = z.output<typeof ListDashboardsQuerySchema>;

export const DASHBOARD_TEMPLATES = ['blank', 'operations'] as const;

export const CreateDashboardSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    description: nullableText(300).default(null),
    isShared: z.boolean().default(false),
    template: z
      .enum(DASHBOARD_TEMPLATES)
      .default('blank')
      .describe('`operations` starts with KPIs, an alarm table, an alarm trend and the on-duty list.'),
  })
  .meta({ id: 'CreateDashboard' });
export type CreateDashboardInput = z.input<typeof CreateDashboardSchema>;
export type CreateDashboardDto = z.output<typeof CreateDashboardSchema>;

export const UpdateDashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: nullableText(300),
    isShared: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateDashboard' });
export type UpdateDashboardDto = z.output<typeof UpdateDashboardSchema>;
