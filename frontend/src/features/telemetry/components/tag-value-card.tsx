import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, YAxis } from 'recharts';
import type { RelativeRange } from '@gen-ui/shared';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { tagsListQueryOptions } from '@/features/tags/api/queries';
import { TagValue } from '@/features/tags/components/tag-value';
import { formatDateTime, formatRelative } from '@/lib/format';
import { seriesQueryOptions } from '../api/queries';
import { tooltipTime } from '../lib/chart-model';

/** One tag's latest reading as a headline number, with a sparkline of the window for context. */
export function TagValueCard({ tagId, range = '24h' }: { tagId: string; range?: RelativeRange }) {
  const tag = useQuery({ ...tagsListQueryOptions({ ids: [tagId], pageSize: 1 }), enabled: Boolean(tagId) });
  const series = useQuery({ ...seriesQueryOptions({ tagIds: [tagId], range }), enabled: Boolean(tagId) });
  const data = tag.data?.items[0];

  if (!tagId) return <p className="text-sm text-muted-foreground">Choose a tag in the widget settings.</p>;

  if (tag.isPending) return <Skeleton className="h-full min-h-16" />;
  if (!data) return <p className="text-sm text-muted-foreground">This tag no longer exists.</p>;

  const points = (series.data?.series[0]?.points ?? []).map((point) => ({ t: new Date(point.t).getTime(), v: point.v }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          <TagValue tag={data} />
        </span>
      </div>
      <p className="truncate text-xs text-muted-foreground" title={formatDateTime(data.lastValueAt)}>
        {data.asset.name} · {formatRelative(data.lastValueAt)}
      </p>
      {points.length > 1 && (
        <ChartContainer config={{ v: { label: data.name, color: 'var(--chart-1)' } }} className="mt-auto aspect-auto h-10 w-full">
          <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={['auto', 'auto']} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_, payload) => {
                    const t = payload?.[0]?.payload?.t;
                    return typeof t === 'number' ? tooltipTime.format(new Date(t)) : '';
                  }}
                />
              }
            />
            <Area dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={2} fill="var(--color-v)" fillOpacity={0.12} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
