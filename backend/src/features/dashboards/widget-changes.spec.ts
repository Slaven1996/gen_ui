import type { DashboardWidget, SaveWidgetDto } from '@gen-ui/shared';
import { planWidgetChanges } from './widget-changes.js';

const DASHBOARD = '60000000-0000-4000-8000-000000000001';
const KPI_ID = '61000000-0000-4000-8000-000000000001';
const DUTY_ID = '61000000-0000-4000-8000-000000000002';

const kpi: DashboardWidget = {
  id: KPI_ID,
  dashboardId: DASHBOARD,
  type: 'KPI',
  title: 'Open alarms',
  position: 0,
  width: 3,
  height: 1,
  config: { metric: 'OPEN_ALARMS' },
};
const onDuty: DashboardWidget = {
  id: DUTY_ID,
  dashboardId: DASHBOARD,
  type: 'ON_DUTY',
  title: 'On duty now',
  position: 1,
  width: 4,
  height: 2,
  config: {},
};

const saved = (widget: DashboardWidget, changes: Partial<SaveWidgetDto> = {}): SaveWidgetDto =>
  ({ id: widget.id, type: widget.type, title: widget.title, width: widget.width, height: widget.height, config: widget.config, ...changes }) as SaveWidgetDto;

describe('planWidgetChanges', () => {
  it('keeps listed widgets in their new order, adds new ones and removes the rest', () => {
    const trend: SaveWidgetDto = { type: 'ALARM_TREND', title: 'Alarms per day', config: { range: '7d', interval: 'day' } };
    const plan = planWidgetChanges([kpi, onDuty], [trend, saved(kpi, { title: 'Open' })]);
    expect(plan).toEqual({
      create: [{ widget: trend, position: 0 }],
      update: [{ before: kpi, after: saved(kpi, { title: 'Open' }), position: 1 }],
      remove: [onDuty],
    });
  });

  it('removes every widget when none is listed', () => {
    expect(planWidgetChanges([kpi, onDuty], [])).toEqual({ create: [], update: [], remove: [kpi, onDuty] });
  });

  it('refuses a widget from another dashboard', () => {
    const stranger = saved({ ...kpi, id: '61000000-0000-4000-8000-000000000099' });
    expect(planWidgetChanges([kpi], [stranger])).toHaveProperty('error');
  });

  it('refuses the same widget twice', () => {
    expect(planWidgetChanges([kpi], [saved(kpi), saved(kpi)])).toHaveProperty('error');
  });

  it("refuses to change a widget's type", () => {
    const changed = { ...saved(kpi), type: 'DEVICE_STATUS', config: {} } as SaveWidgetDto;
    expect(planWidgetChanges([kpi], [changed])).toHaveProperty('error');
  });
});
