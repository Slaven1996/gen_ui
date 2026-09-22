import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  SERIES_INTERVAL_MS,
  type ChartType,
  type SeriesTag,
  type TelemetrySeries,
  type TelemetrySeriesQueryInput,
} from '@gen-ui/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api/errors';
import { formatNumber } from '@/lib/format';
import { seriesQueryOptions } from './api';

/** Series colour by position in the caller's tag list — stable while other tags come and go. */
export const seriesColor = (index: number) => `var(--chart-${(index % 8) + 1})`;

type Row = { t: number } & Record<string, number | null>;

interface UnitGroup {
  unit: string | null;
  tags: Array<SeriesTag & { color: string }>;
  rows: Row[];
}

/**
 * One group per unit: tags measured in different units never share a y-axis
 * (no dual axes), they get stacked charts on the same time axis instead.
 * A gap in the data breaks the line rather than being bridged by it.
 */
function groupByUnit(data: TelemetrySeries): UnitGroup[] {
  const intervalMs = SERIES_INTERVAL_MS[data.interval];
  const groups = new Map<string, UnitGroup>();

  data.series.forEach(({ tag }, index) => {
    const key = tag.unit ?? '';
    const group = groups.get(key) ?? { unit: tag.unit, tags: [], rows: [] };
    group.tags.push({ ...tag, color: seriesColor(index) });
    groups.set(key, group);
  });

  for (const group of groups.values()) {
    const rows = new Map<number, Row>();
    const put = (t: number, tagId: string, v: number | null) => {
      const row = rows.get(t) ?? ({ t } as Row);
      row[tagId] = v;
      rows.set(t, row);
    };
    for (const { tag, points } of data.series.filter((series) => (series.tag.unit ?? '') === (group.unit ?? ''))) {
      let previous: number | undefined;
      for (const point of points) {
        const t = new Date(point.t).getTime();
        if (previous !== undefined && t - previous > intervalMs * 2.5) put(previous + intervalMs, tag.id, null);
        put(t, tag.id, point.v);
        previous = t;
      }
    }
    group.rows = [...rows.values()].sort((a, b) => a.t - b.t);
  }
  return [...groups.values()];
}

function timeFormatter(spanMs: number) {
  const format =
    spanMs <= 36 * 3_600_000
      ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
      : spanMs <= 10 * 86_400_000
        ? new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit' })
        : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return (value: number) => format.format(new Date(value));
}

const tooltipTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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

function UnitChart({
  group,
  domain,
  chartType,
  height,
  showUnit,
}: {
  group: UnitGroup;
  domain: [number, number];
  chartType: ChartType;
  height: number;
  showUnit: boolean;
}) {
  const config = Object.fromEntries(
    group.tags.map((tag) => [tag.id, { label: `${tag.name} · ${tag.asset.name}`, color: tag.color }]),
  ) satisfies ChartConfig;
  const formatTick = timeFormatter(domain[1] - domain[0]);

  const grid = <CartesianGrid vertical={false} strokeOpacity={0.5} />;
  const xAxis =
    chartType === 'bar' ? (
      <XAxis dataKey="t" tickFormatter={formatTick} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
    ) : (
      <XAxis
        dataKey="t"
        type="number"
        scale="time"
        domain={domain}
        tickFormatter={formatTick}
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={24}
      />
    );
  const yAxis = (
    <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => formatNumber(value, 1)} domain={['auto', 'auto']} />
  );
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          indicator="line"
          labelFormatter={(_, payload) => {
            const t = payload?.[0]?.payload?.t;
            return typeof t === 'number' ? tooltipTime.format(new Date(t)) : '';
          }}
        />
      }
    />
  );
  const legend = group.tags.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null;
  const common = { data: group.rows, accessibilityLayer: true, margin: { top: 4, right: 8, left: 0, bottom: 0 } };

  return (
    <figure className="space-y-1">
      {showUnit && (
        <figcaption className="text-xs text-muted-foreground">
          {group.unit ?? 'No unit'}
          {group.tags.length === 1 && ` · ${group.tags[0].name}`}
        </figcaption>
      )}
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        {chartType === 'bar' ? (
          <BarChart {...common} barGap={2}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legend}
            {group.tags.map((tag) => (
              <Bar key={tag.id} dataKey={tag.id} fill={tag.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        ) : chartType === 'area' ? (
          <AreaChart {...common}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legend}
            {group.tags.map((tag) => (
              <Area
                key={tag.id}
                dataKey={tag.id}
                type="monotone"
                stroke={tag.color}
                strokeWidth={2}
                fill={tag.color}
                fillOpacity={0.12}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legend}
            {group.tags.map((tag) => (
              <Line
                key={tag.id}
                dataKey={tag.id}
                type={chartType === 'step' ? 'stepAfter' : 'monotone'}
                stroke={tag.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ChartContainer>
    </figure>
  );
}
