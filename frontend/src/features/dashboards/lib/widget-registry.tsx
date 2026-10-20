import type { ReactNode } from 'react';
import type { LinkProps } from '@tanstack/react-router';
import {
  Activity,
  BarChart3,
  Bell,
  Cpu,
  Gauge,
  LineChart,
  NotebookPen,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  ListAlarmsQuerySchema,
  ListLogbookQuerySchema,
  type WidgetConfig,
  type WidgetConfigInput,
  type WidgetType,
} from '@gen-ui/shared';
import { AlarmsTable } from '@/features/alarms/components/alarms-table';
import { AlarmTrendChart } from '@/features/analytics/components/alarm-trend-chart';
import { DeviceStatusSummary } from '@/features/analytics/components/device-status-summary';
import { KpiTile } from '@/features/analytics/components/kpi-tile';
import { TopAlarmsList } from '@/features/analytics/components/top-alarms-list';
import { KPIS } from '@/features/analytics/lib/kpis';
import { LogbookFeed } from '@/features/logbook/components/logbook-feed';
import { OnDutyStrip } from '@/features/shifts/components/on-duty/on-duty-strip';
import { TagValueCard } from '@/features/telemetry/components/tag-value-card';
import { TelemetryChart } from '@/features/telemetry/components/telemetry-chart';

type FullPageLink = Pick<LinkProps, 'to' | 'search'>;

interface WidgetDefinition<T extends WidgetType> {
  label: string;
  description: string;
  icon: LucideIcon;
  /** Suggested title for a new widget. */
  defaultTitle: string;
  /** What a new widget of this type starts with. */
  defaultConfig: WidgetConfigInput<T>;
  /** Renders the view. `bodyHeight` is the pixel height left inside the card. */
  render: (config: WidgetConfig<T>, bodyHeight: number, title: string) => ReactNode;
  /** The full page showing the same data, with the widget's config as its URL. */
  link: (config: WidgetConfig<T>) => FullPageLink;
  /** Renders its own card (no frame around it). */
  frameless?: boolean;
}

type Registry = { [T in WidgetType]: WidgetDefinition<T> };

/**
 * Every widget type: how to draw it from its config, and where "View full
 * page" goes. The config is the query of the matching page, so the link just
 * reuses it. A Generative UI tool emitting `{ type, config }` renders with
 * this same registry.
 */
export const WIDGETS: Registry = {
  KPI: {
    label: 'KPI',
    description: 'One headline number: open alarms, devices offline, response time…',
    icon: Gauge,
    defaultTitle: 'Open alarms',
    defaultConfig: { metric: 'OPEN_ALARMS' },
    frameless: true,
    render: (config, _height, title) => <KpiTile metric={config.metric} assetId={config.assetId} title={title} />,
    link: (config) => KPIS[config.metric].link(config.assetId),
  },
  TAG_VALUE: {
    label: 'Live value',
    description: 'The latest reading of one tag, with a sparkline.',
    icon: Activity,
    defaultTitle: 'Live value',
    defaultConfig: { tagId: '', range: '24h' },
    render: (config) => <TagValueCard tagId={config.tagId} range={config.range} />,
    link: (config) => ({ to: '/graphs', search: { tagIds: [config.tagId], range: config.range } }),
  },
  TIME_SERIES: {
    label: 'Chart',
    description: 'Readings of up to eight tags over time.',
    icon: LineChart,
    defaultTitle: 'Trend',
    defaultConfig: { tagIds: [], range: '24h' },
    render: (config, bodyHeight) => (
      <TelemetryChart
        query={{ tagIds: config.tagIds, range: config.range, interval: config.interval, aggregate: config.aggregate }}
        chartType={config.chartType}
        height={Math.max(bodyHeight - 24, 120)}
      />
    ),
    link: ({ tagIds, range, interval, aggregate, chartType }) => ({
      to: '/graphs',
      search: { tagIds, range, interval, aggregate, chartType },
    }),
  },
  ALARM_TABLE: {
    label: 'Alarm list',
    description: 'Alarms filtered by state, severity, asset or time.',
    icon: Bell,
    defaultTitle: 'Open alarms',
    defaultConfig: { state: ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED'], pageSize: 5 },
    render: ({ pageSize, ...filters }) => (
      <AlarmsTable query={ListAlarmsQuerySchema.parse({ ...filters, pageSize })} compact />
    ),
    link: ({ pageSize: _pageSize, ...filters }) => ({ to: '/alarms', search: filters }),
  },
  ALARM_TREND: {
    label: 'Alarm trend',
    description: 'Alarms raised per hour, day or week, by severity.',
    icon: BarChart3,
    defaultTitle: 'Alarms per day',
    defaultConfig: { range: '7d', interval: 'day' },
    render: (config, bodyHeight) => <AlarmTrendChart query={config} height={Math.max(bodyHeight, 120)} />,
    link: ({ range, severity, assetId }) => ({ to: '/alarms', search: { range, severity, assetId } }),
  },
  TOP_ALARMS: {
    label: 'Most frequent alarms',
    description: 'The rules or assets raising the most alarms.',
    icon: Trophy,
    defaultTitle: 'Most frequent alarms',
    defaultConfig: { range: '30d', groupBy: 'definition', limit: 5 },
    render: (config) => <TopAlarmsList query={config} />,
    link: ({ range, assetId }) => ({ to: '/alarms', search: { range, assetId } }),
  },
  LOGBOOK_FEED: {
    label: 'Logbook',
    description: 'The latest logbook entries, optionally filtered.',
    icon: NotebookPen,
    defaultTitle: 'Latest in the logbook',
    defaultConfig: { pageSize: 5 },
    render: ({ pageSize, ...filters }) => <LogbookFeed query={ListLogbookQuerySchema.parse({ ...filters, pageSize })} />,
    link: ({ pageSize: _pageSize, ...filters }) => ({ to: '/logbook', search: filters }),
  },
  DEVICE_STATUS: {
    label: 'Device health',
    description: 'How many devices are online, offline, faulted or in maintenance.',
    icon: Cpu,
    defaultTitle: 'Device health',
    defaultConfig: {},
    render: (config) => <DeviceStatusSummary assetId={config.assetId} />,
    link: ({ assetId }) => ({ to: '/devices', search: assetId ? { assetId } : {} }),
  },
  ON_DUTY: {
    label: 'On duty',
    description: 'Who is on shift right now.',
    icon: Users,
    defaultTitle: 'On duty now',
    defaultConfig: {},
    render: (config) => <OnDutyStrip only="now" role={config.role} stacked framed={false} />,
    link: ({ role }) => ({ to: '/shifts', search: role ? { role } : {} }),
  },
};

/** Type-safe lookup for a widget whose type is only known at runtime. */
export function widgetDefinition<T extends WidgetType>(type: T): WidgetDefinition<T> {
  return WIDGETS[type] as WidgetDefinition<T>;
}
