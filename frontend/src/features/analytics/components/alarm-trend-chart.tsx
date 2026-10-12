import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ALARM_SEVERITIES, type AlarmSeverity, type AlarmTrendQueryInput, type TrendInterval } from '@gen-ui/shared';
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
import { SEVERITY } from '@/lib/labels';
import { alarmTrendQueryOptions } from '../api/queries';

/** Severity is a state, so it wears the reserved status colours — always with its label in legend and tooltip. */
const SEVERITY_COLOR: Record<AlarmSeverity, string> = {
  CRITICAL: 'var(--status-critical)',
  HIGH: 'var(--status-serious)',
  MEDIUM: 'var(--status-warning)',
  LOW: 'var(--status-info)',
  INFO: 'var(--status-neutral)',
};

const config = Object.fromEntries(
  ALARM_SEVERITIES.map((severity) => [severity, { label: SEVERITY[severity].label, color: SEVERITY_COLOR[severity] }]),
) satisfies ChartConfig;

const TICK_FORMAT: Record<TrendInterval, Intl.DateTimeFormat> = {
  hour: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
  day: new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' }),
  week: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
};

const TOOLTIP_FORMAT: Record<TrendInterval, Intl.DateTimeFormat> = {
  hour: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
  day: new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }),
  week: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }),
};

/**
 * Alarms raised per hour, day or week, stacked by severity, most severe at
 * the bottom where it is easiest to compare.
 */
export function AlarmTrendChart({ query, height = 260 }: { query: AlarmTrendQueryInput; height?: number }) {
  const trend = useQuery(alarmTrendQueryOptions(query));

  if (trend.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(trend.error)}</AlertDescription>
      </Alert>
    );
  }
  if (trend.isPending) return <Skeleton style={{ height }} />;

  const { interval, buckets } = trend.data;
  const shown = ALARM_SEVERITIES.filter((severity) => buckets.some((bucket) => bucket[severity] > 0));
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No alarms raised in this window.
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={buckets} accessibilityLayer margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
          tickFormatter={(value: string) => TICK_FORMAT[interval].format(new Date(value))}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t;
                return typeof t === 'string' ? TOOLTIP_FORMAT[interval].format(new Date(t)) : '';
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {shown.map((severity, index) => (
          <Bar
            key={severity}
            dataKey={severity}
            stackId="severity"
            fill={SEVERITY_COLOR[severity]}
            // A hairline of the card colour separates stacked segments.
            stroke="var(--card)"
            strokeWidth={2}
            radius={index === shown.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
