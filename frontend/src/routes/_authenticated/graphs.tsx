import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { AreaChart, BarChart3, Link2, LineChart, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ChartTypeSchema,
  SERIES_AGGREGATES,
  SERIES_INTERVALS,
  seriesParams,
  type ChartType,
  type SeriesAggregate,
} from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { SelectFilter } from '@/components/filters/select-filter';
import { TimeRangeFilter } from '@/components/filters/time-range-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { TagPicker } from '@/features/tags/tag-picker';
import { seriesQueryOptions } from '@/features/telemetry/api';
import { TagStatsTable } from '@/features/telemetry/tag-stats-table';
import { TelemetryChart } from '@/features/telemetry/telemetry-chart';
import { defaultsOf, searchSchema } from '@/lib/search';

/** The telemetry series query as a URL, plus how to draw it. A bookmark is a saved chart. */
const graphsSearch = z.object({ ...seriesParams, chartType: ChartTypeSchema.default('line') });
type GraphsSearch = z.output<typeof graphsSearch>;

export const Route = createFileRoute('/_authenticated/graphs')({
  staticData: { title: 'Graphs' },
  validateSearch: searchSchema(graphsSearch),
  search: { middlewares: [stripSearchParams(defaultsOf(graphsSearch))] },
  loaderDeps: ({ search: { chartType: _chartType, ...query } }) => query,
  loader: ({ context, deps }) =>
    deps.tagIds?.length ? context.queryClient.ensureQueryData(seriesQueryOptions(deps)) : undefined,
  component: GraphsPage,
});

const CHART_TYPES: Array<{ value: ChartType; label: string; icon: typeof LineChart }> = [
  { value: 'line', label: 'Line', icon: LineChart },
  { value: 'step', label: 'Step', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
];

const AGGREGATE_LABELS: Record<SeriesAggregate, string> = {
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  sum: 'Sum',
  last: 'Last value',
};

function GraphsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { chartType, ...query } = search;

  const setSearch = (patch: Partial<GraphsSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });

  useAssistantContext({
    title: 'Graphs',
    summary: query.tagIds?.length
      ? `Plotting ${query.tagIds.length} tag(s), ${query.from ? 'custom window' : `last ${query.range}`}, ${query.aggregate} per ${query.interval} bucket`
      : 'No tags selected yet',
  });

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied — it opens this exact chart');
  };

  return (
    <PageContainer>
      <PageHeader
        title="Graphs"
        description="Plot up to eight tags. Tags with different units get their own chart on a shared time axis."
        actions={
          <Button variant="outline" onClick={copyLink} disabled={!query.tagIds?.length}>
            <Link2 />
            Copy link
          </Button>
        }
      />

      <FilterBar>
        <TagPicker
          value={query.tagIds ?? []}
          onChange={(tagIds) => setSearch({ tagIds: tagIds.length ? tagIds : undefined })}
          className="w-64"
        />
        <TimeRangeFilter value={query} onChange={(range) => setSearch(range)} allowAny={false} />
        <SelectFilter
          label="Bucket size"
          options={[
            { value: 'auto', label: 'Automatic buckets' },
            ...SERIES_INTERVALS.map((interval) => ({ value: interval, label: `${interval} buckets` })),
          ]}
          value={query.interval}
          onChange={(interval) => setSearch({ interval: interval ?? 'auto' })}
          className="w-44"
        />
        <SelectFilter
          label="Aggregate"
          options={SERIES_AGGREGATES.map((aggregate) => ({ value: aggregate, label: AGGREGATE_LABELS[aggregate] }))}
          value={query.aggregate}
          onChange={(aggregate) => setSearch({ aggregate: aggregate ?? 'avg' })}
          className="w-36"
        />
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Chart type">
          {CHART_TYPES.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={chartType === value ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              aria-pressed={chartType === value}
              aria-label={label}
              title={label}
              onClick={() => setSearch({ chartType: value })}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </FilterBar>

      <Card>
        <CardContent>
          <TelemetryChart query={query} chartType={chartType} height={380} />
        </CardContent>
      </Card>

      <TagStatsTable query={{ tagIds: query.tagIds, range: query.range, from: query.from, to: query.to }} />
    </PageContainer>
  );
}
