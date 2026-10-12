import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChartType, TelemetrySeriesQueryInput } from '@gen-ui/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api/errors';
import { seriesQueryOptions } from '../api/queries';
import { groupByUnit } from '../lib/chart-model';
import { UnitChart } from './unit-chart';

/**
 * Time series for one or more tags, as a standalone view: the Graphs page,
 * the TIME_SERIES dashboard widget and (next) a chart in a chat answer all
 * render this with the same query.
 */
export function TelemetryChart({
  query,
  chartType = 'line',
  height = 280,
}: {
  query: TelemetrySeriesQueryInput;
  chartType?: ChartType;
  /** Total height; shared between unit groups. */
  height?: number;
}) {
  const series = useQuery(seriesQueryOptions(query));
  const groups = useMemo(() => (series.data ? groupByUnit(series.data) : []), [series.data]);

  if (!query.tagIds || query.tagIds.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground" style={{ height }}>
        Choose one or more tags to plot.
      </div>
    );
  }
  if (series.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(series.error)}</AlertDescription>
      </Alert>
    );
  }
  if (series.isPending) return <Skeleton style={{ height }} />;

  const data = series.data;
  const domain: [number, number] = [new Date(data.from).getTime(), new Date(data.to).getTime()];
  const groupHeight = Math.max(140, Math.floor(height / Math.max(groups.length, 1)));

  return (
    <div className="space-y-3" aria-busy={series.isPlaceholderData}>
      {groups.map((group) => (
        <UnitChart key={group.unit ?? ''} group={group} domain={domain} chartType={chartType} height={groupHeight} showUnit={groups.length > 1 || Boolean(group.unit)} />
      ))}
      <p className="text-xs text-muted-foreground">
        {data.aggregate === 'avg' ? 'Average' : data.aggregate === 'last' ? 'Last value' : `${data.aggregate[0].toUpperCase()}${data.aggregate.slice(1)}`}{' '}
        per {data.interval} bucket.
      </p>
    </div>
  );
}
