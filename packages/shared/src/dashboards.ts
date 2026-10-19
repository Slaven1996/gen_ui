import { z } from 'zod';
import { alarmFilters } from './alarms.js';
import { alarmTrendParams, KPI_METRICS, topAlarmsParams } from './analytics.js';
import { csvEnum, itemsSchema, RelativeRangeSchema, UserRefSchema } from './common/query.js';
import { logbookFilters } from './logbook.js';
import { SHIFT_ROLES } from './shifts.js';
import { ChartTypeSchema, MAX_SERIES_TAGS, seriesParams } from './telemetry.js';

/**
 * Widgets are the embeddable views of the app. Each widget's `config` is a
 * subset of the query its full page understands — the alarm table widget takes
 * `state`, `severity`, `assetId`… exactly like `GET /api/alarms` and the
 * `/alarms` URL do. That is what makes "View full page" a plain link, and it is
 * the shape the assistant's `createDashboard` tool emits for the same views.
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
export type WidgetWidth = (typeof WIDGET_WIDTHS)[number];
/** Row units (roughly 11rem each). */
export const WIDGET_HEIGHTS = [1, 2, 3] as const;
export const WidgetHeightSchema = z.union(WIDGET_HEIGHTS.map((height) => z.literal(height)));
export type WidgetHeight = (typeof WIDGET_HEIGHTS)[number];

/** Most widgets one dashboard holds. */
export const MAX_DASHBOARD_WIDGETS = 50;

const tableSize = z.coerce.number().int().min(3).max(20).default(5).describe('Rows shown.');

export const WIDGET_CONFIG_SCHEMAS = {
  KPI: z.object({
    metric: z.enum(KPI_METRICS, { error: 'Choose a figure' }),
    assetId: z.guid().optional(),
  }),
  TAG_VALUE: z.object({
    tagId: z.guid({ error: 'Choose a tag' }),
    range: RelativeRangeSchema.default('24h').describe('Window of the sparkline.'),
  }),
  TIME_SERIES: z.object({
    tagIds: z.array(z.guid(), { error: 'Pick at least one tag' }).min(1, 'Pick at least one tag').max(MAX_SERIES_TAGS),
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

export const WIDGET_DEFAULT_SIZE: Record<WidgetType, { width: WidgetWidth; height: WidgetHeight }> = {
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

/** The title a widget gets when nobody gave it one (e.g. one the assistant left untitled). */
export const WIDGET_DEFAULT_TITLES: Record<WidgetType, string> = {
  KPI: 'Key figure',
  TAG_VALUE: 'Live value',
  TIME_SERIES: 'Trend',
  ALARM_TABLE: 'Alarms',
  ALARM_TREND: 'Alarm trend',
  TOP_ALARMS: 'Most frequent alarms',
  LOGBOOK_FEED: 'Latest in the logbook',
  DEVICE_STATUS: 'Device health',
  ON_DUTY: 'On duty now',
};

/** The config fields a widget can't do without, having no default: a KPI's figure, a live value's tag, a chart's tags. */
export function requiredWidgetFields(type: WidgetType): string[] {
  const shape: Record<string, z.ZodType> = WIDGET_CONFIG_SCHEMAS[type].shape;
  return Object.entries(shape)
    .filter(([, field]) => !field.safeParse(undefined).success)
    .map(([key]) => key);
}

/** A widget as it is being put together: its config may still be incomplete. */
export interface WidgetDraftInput {
  type: WidgetType;
  title: string;
  config: unknown;
}

export interface WidgetCheck {
  /** The config as the widget's view takes it, defaults filled in; only when nothing is wrong. */
  config?: WidgetConfig;
  /** What is wrong, by field (`title` or a config field), the first message for each. Empty when complete. */
  errors: Record<string, string>;
}

/**
 * The one check of a widget: a title, and a config its type's schema accepts.
 * The assistant's dashboard tool, the chat's preview, the Dashboard page and
 * the widget dialog all use it; the browser adds whether the tags and assets
 * it names still exist.
 */
export function widgetIssues(widget: WidgetDraftInput): WidgetCheck {
  const errors: Record<string, string> = {};
  if (!widget.title.trim()) errors.title = 'Give the widget a title';
  const parsed = WIDGET_CONFIG_SCHEMAS[widget.type].safeParse(widget.config ?? {});
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? 'config')] ??= issue.message;
    return { errors };
  }
  return Object.keys(errors).length > 0 ? { errors } : { config: parsed.data as WidgetConfig, errors };
}

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

/** One widget of a dashboard being saved. Its place on the grid is its place in `widgets`. */
export const SaveWidgetSchema = widgetUnion({
  id: z.guid().optional().describe('A widget this dashboard already has, to keep it; leave it out for a new one.'),
  title: z.string().trim().min(1, 'Give the widget a title').max(80),
  width: WidgetWidthSchema.optional().describe('Defaults by type.'),
  height: WidgetHeightSchema.optional().describe('Defaults by type.'),
}).meta({ id: 'SaveWidget' });
export type SaveWidgetInput = z.input<typeof SaveWidgetSchema>;
export type SaveWidgetDto = z.output<typeof SaveWidgetSchema>;

// ─── Dashboards ─────────────────────────────────────────────────────────────

export const DashboardSchema = z
  .object({
    id: z.guid(),
    name: z.string(),
    isShared: z.boolean().describe('Visible (read-only) to every signed-in user.'),
    owner: UserRefSchema,
    canEdit: z.boolean().describe('Whether the caller may change it (name, sharing, widgets): only its owner.'),
    canDelete: z.boolean().describe('Whether the caller may delete it: its owner, or an admin when it is shared.'),
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

/**
 * A whole dashboard, saved in one request. `POST /dashboards` creates it;
 * `PUT /dashboards/:id` replaces the name, sharing and widgets with these:
 * widgets with an `id` are kept and updated, missing ones removed, new ones added.
 */
const dashboardFields = {
  name: z.string().trim().min(1, 'Give the dashboard a name').max(80),
  isShared: z.boolean().default(false).describe('Visible (read-only) to every signed-in user.'),
  widgets: z
    .array(SaveWidgetSchema)
    .max(MAX_DASHBOARD_WIDGETS)
    .default([])
    .describe('Every widget, in grid order: left to right, top to bottom.'),
};

export const SaveDashboardSchema = z.object(dashboardFields).meta({ id: 'SaveDashboard' });
export type SaveDashboardInput = z.input<typeof SaveDashboardSchema>;
export type SaveDashboardDto = z.output<typeof SaveDashboardSchema>;

/** Where a dashboard came from: the assistant's `createDashboard` call it was saved from. */
export const DashboardSourceSchema = z.object({
  conversationId: z.uuid().describe('The conversation holding the call.'),
  toolCallId: z.string().min(1).max(200).describe("The call's id."),
});
export type DashboardSource = z.infer<typeof DashboardSourceSchema>;

export const CreateDashboardSchema = z
  .object({
    ...dashboardFields,
    source: DashboardSourceSchema.optional().describe(
      "The assistant's draft it is saved from. One draft creates one dashboard, and the chat then shows it as created. Left out when the conversation isn't yours or no longer exists.",
    ),
  })
  .meta({ id: 'CreateDashboard' });
export type CreateDashboardInput = z.input<typeof CreateDashboardSchema>;
export type CreateDashboardDto = z.output<typeof CreateDashboardSchema>;
