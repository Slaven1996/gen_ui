import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { alarmTrendParams, KPI_METRICS, TREND_INTERVALS, type KpiMetric } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { SelectFilter } from '@/components/filters/select-filter';
import { TimeRangeFilter } from '@/components/filters/time-range-filter';
import { describeTimeRange } from '@/lib/time-range';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { ViewCard } from '@/components/view-card';
import { ViewFullPageLink } from '@/components/view-full-page-link';
import { AlarmTrendChart } from '@/features/analytics/components/alarm-trend-chart';
import { DeviceStatusSummary } from '@/features/analytics/components/device-status-summary';
import { KpiTile } from '@/features/analytics/components/kpi-tile';
import { TopAlarmsList } from '@/features/analytics/components/top-alarms-list';
import { AssetSelect } from '@/features/assets/components/asset-select';
import { defaultsOf, searchSchema } from '@/lib/search';

const analyticsSearch = z.object({
  range: alarmTrendParams.range,
  from: alarmTrendParams.from,
  to: alarmTrendParams.to,
  interval: alarmTrendParams.interval,
  assetId: alarmTrendParams.assetId,
});
type AnalyticsSearch = z.output<typeof analyticsSearch>;

export const Route = createFileRoute('/_authenticated/analytics')({
  staticData: { title: 'Analytics' },
  validateSearch: searchSchema(analyticsSearch),
  search: { middlewares: [stripSearchParams(defaultsOf(analyticsSearch))] },
  component: AnalyticsPage,
});

const HEADLINE: KpiMetric[] = ['OPEN_ALARMS', 'UNACKNOWLEDGED_ALARMS', 'ALARMS_LAST_24H', 'MTTA'];
const SECONDARY = KPI_METRICS.filter((metric) => ['DEVICES_OFFLINE', 'CRITICAL_ALARMS', 'ASSETS'].includes(metric));

const INTERVAL_LABELS = { hour: 'Per hour', day: 'Per day', week: 'Per week' } as const;

function AnalyticsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (patch: Partial<AnalyticsSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });

  const window = { range: search.range, from: search.from, to: search.to };
  const windowLabel = describeTimeRange(search).toLowerCase();

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Analytics"
        description="Where alarm load comes from and how quickly it is handled. Every number opens the list behind it."
      />

      <FilterBar
        canReset={Boolean(search.assetId || search.from || search.to || search.range !== '7d' || search.interval !== 'day')}
        onReset={() => navigate({ search: {}, replace: true })}
      >
        <TimeRangeFilter value={search} onChange={(range) => setSearch(range)} allowAny={false} presets={['24h', '7d', '30d', '90d']} />
        <SelectFilter
          label="Trend buckets"
          options={TREND_INTERVALS.map((interval) => ({ value: interval, label: INTERVAL_LABELS[interval] }))}
          value={search.interval}
          onChange={(interval) => setSearch({ interval: interval ?? 'day' })}
          className="w-32"
        />
        <AssetSelect value={search.assetId} onChange={(assetId) => setSearch({ assetId })} />
      </FilterBar>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HEADLINE.map((metric) => (
          <KpiTile key={metric} metric={metric} assetId={search.assetId} />
        ))}
      </div>

      <ViewCard
        title="Alarms raised"
        description={`${INTERVAL_LABELS[search.interval]}, ${windowLabel}, by severity`}
        action={<ViewFullPageLink to="/alarms" search={{ ...window, assetId: search.assetId }} />}
      >
        <AlarmTrendChart query={{ ...window, interval: search.interval, assetId: search.assetId }} height={280} />
      </ViewCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <ViewCard title="Most frequent rules" description={windowLabel}>
          <TopAlarmsList query={{ ...window, groupBy: 'definition', limit: 8, assetId: search.assetId }} />
        </ViewCard>
        <ViewCard title="Most affected assets" description={windowLabel}>
          <TopAlarmsList query={{ ...window, groupBy: 'asset', limit: 8, assetId: search.assetId }} />
        </ViewCard>
        <div className="space-y-4">
          <ViewCard title="Device health" action={<ViewFullPageLink to="/devices" search={search.assetId ? { assetId: search.assetId } : {}} />}>
            <DeviceStatusSummary assetId={search.assetId} />
          </ViewCard>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {SECONDARY.map((metric) => (
              <KpiTile key={metric} metric={metric} assetId={search.assetId} />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
