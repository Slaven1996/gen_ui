import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type { GenUITools } from '@gen-ui/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ToolError, ToolSkeleton } from './tool-status';
import type { ToolPartFor } from './types';

type ChartInput = GenUITools['showChart']['input'];

export function ChartTool({ part }: { part: ToolPartFor<'showChart'> }) {
  switch (part.state) {
    case 'output-error':
      return <ToolError title="Couldn’t draw this chart" message={part.errorText} />;
    case 'input-streaming':
      // Charts need the full dataset before they make sense.
      return <ToolSkeleton label="Drawing chart…" shape="chart" />;
    default:
      return <ChartCard input={part.input} />;
  }
}

/** Series colours come from the --chart-1…5 design tokens. */
const seriesColor = (index: number) => `var(--chart-${(index % 5) + 1})`;

function ChartCard({ input }: { input: ChartInput }) {
  const { title, description, type, xKey, series, data } = input;

  const config = useMemo(
    () =>
      Object.fromEntries(
        series.map((item, index) => [item.key, { label: item.label, color: seriesColor(index) }]),
      ) satisfies ChartConfig,
    [series],
  );

  const grid = <CartesianGrid vertical={false} />;
  const xAxis = <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />;
  const yAxis = <YAxis tickLine={false} axisLine={false} width={44} />;
  const tooltip = <ChartTooltip content={<ChartTooltipContent />} />;
  const legend = series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null;

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          {type === 'bar' ? (
            <BarChart data={data} accessibilityLayer>
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              {legend}
              {series.map((item, index) => (
                <Bar key={item.key} dataKey={item.key} fill={seriesColor(index)} radius={4} />
              ))}
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} accessibilityLayer>
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              {legend}
              {series.map((item, index) => (
                <Line
                  key={item.key}
                  dataKey={item.key}
                  stroke={seriesColor(index)}
                  strokeWidth={2}
                  dot={false}
                  type="monotone"
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={data} accessibilityLayer>
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              {legend}
              {series.map((item, index) => (
                <Area
                  key={item.key}
                  dataKey={item.key}
                  stroke={seriesColor(index)}
                  fill={seriesColor(index)}
                  fillOpacity={0.2}
                  type="monotone"
                />
              ))}
            </AreaChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
