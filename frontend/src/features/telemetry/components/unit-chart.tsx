import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type { ChartType } from '@gen-ui/shared';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatNumber } from '@/lib/format';
import { timeFormatter, tooltipTime, type UnitGroup } from '../lib/chart-model';

/** The chart of one unit group: every tag measured in that unit on one y-axis. */
export function UnitChart({
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
