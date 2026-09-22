import type { WidgetConfigInput, WidgetType } from '@gen-ui/shared';

type TemplateWidget = {
  [T in WidgetType]: { type: T; title: string; width?: number; height?: number; config: WidgetConfigInput<T> };
}[WidgetType];

/**
 * The starting layout for `template: "operations"`. Rows add up to 12
 * columns: four KPIs; the alarm table beside who is on duty; trend and
 * most frequent alarms side by side.
 */
export const OPERATIONS_TEMPLATE: TemplateWidget[] = [
  { type: 'KPI', title: 'Open alarms', config: { metric: 'OPEN_ALARMS' } },
  { type: 'KPI', title: 'Unacknowledged', config: { metric: 'UNACKNOWLEDGED_ALARMS' } },
  { type: 'KPI', title: 'Devices offline', config: { metric: 'DEVICES_OFFLINE' } },
  { type: 'KPI', title: 'Mean time to acknowledge', config: { metric: 'MTTA' } },
  {
    type: 'ALARM_TABLE',
    title: 'Alarms needing attention',
    config: { state: ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED'], pageSize: 6 },
  },
  { type: 'ON_DUTY', title: 'On duty now', config: {} },
  { type: 'ALARM_TREND', title: 'Alarms per day', width: 6, config: { range: '7d', interval: 'day' } },
  { type: 'TOP_ALARMS', title: 'Most frequent alarms', width: 6, config: { range: '30d', groupBy: 'definition' } },
];
