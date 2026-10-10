import { AreaChart, BarChart3, LineChart, TrendingUp } from 'lucide-react';
import {
  GraphQuerySchema,
  SERIES_AGGREGATES,
  SERIES_INTERVALS,
  type ChartType,
  type GraphQuery,
  type GraphQueryInput,
  type SeriesAggregate,
} from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { SelectFilter } from '@/components/filters/select-filter';
import { TimeRangeFilter } from '@/components/filters/time-range-filter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TagPicker } from '@/features/tags/tag-picker';
import { useViewQuery } from '@/hooks/use-view-query';
import { parseLeniently } from '@/lib/search';
import { cn } from '@/lib/utils';
import { TelemetryChart } from './telemetry-chart';

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

/**
 * The Graphs page's chart with its filters (tags, time window, buckets,
 * aggregate, chart type), as a standalone view. The page passes
 * `onQueryChange` to keep the query in its URL; a chart in a chat answer
 * omits it and `useViewQuery` keeps the query locally.
 */
export function TelemetryExplorer({
  query,
  onQueryChange,
  height = 380,
  framed = true,
  className,
}: {
  query: GraphQuery;
  onQueryChange?: (next: GraphQuery) => void;
  height?: number;
  /** Draw the chart on its own card; off when the explorer already sits in one. */
  framed?: boolean;
  className?: string;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  // Through the schema, so a cleared value falls back to its default as it does in the URL.
  // The optional keys are listed so a cleared one doesn't linger in local state.
  const set = (patch: Partial<GraphQueryInput>) =>
    update({ tagIds: undefined, from: undefined, to: undefined, ...parseLeniently(GraphQuerySchema, { ...current, ...patch }) });
  const { chartType, ...series } = current;

  const chart = <TelemetryChart query={series} chartType={chartType} height={height} />;

  return (
    <div className={cn('space-y-6', className)}>
      <FilterBar>
        <TagPicker
          value={series.tagIds ?? []}
          onChange={(tagIds) => set({ tagIds: tagIds.length ? tagIds : undefined })}
          className="w-64"
        />
        <TimeRangeFilter value={series} onChange={(range) => set(range)} allowAny={false} />
        <SelectFilter
          label="Bucket size"
          options={[
            { value: 'auto', label: 'Automatic buckets' },
            ...SERIES_INTERVALS.map((interval) => ({ value: interval, label: `${interval} buckets` })),
          ]}
          value={series.interval}
          onChange={(interval) => set({ interval: interval ?? 'auto' })}
          className="w-44"
        />
        <SelectFilter
          label="Aggregate"
          options={SERIES_AGGREGATES.map((aggregate) => ({ value: aggregate, label: AGGREGATE_LABELS[aggregate] }))}
          value={series.aggregate}
          onChange={(aggregate) => set({ aggregate: aggregate ?? 'avg' })}
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
              onClick={() => set({ chartType: value })}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </FilterBar>

      {framed ? (
        <Card>
          <CardContent>{chart}</CardContent>
        </Card>
      ) : (
        chart
      )}
    </div>
  );
}
