import { useQuery } from '@tanstack/react-query';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { KpiMetric } from '@gen-ui/shared';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { summaryQueryOptions } from '../api/queries';
import { KPIS } from '../lib/kpis';

/** One headline number. A stat tile, not a chart — the number is the answer. */
export function KpiTile({
  metric,
  assetId,
  title,
  className,
}: {
  metric: KpiMetric;
  assetId?: string;
  /** Overrides the metric's own label (a widget's title). */
  title?: string;
  className?: string;
}) {
  const summary = useQuery(summaryQueryOptions(assetId));
  const kpi = KPIS[metric];
  const value = summary.data ? kpi.value(summary.data) : undefined;
  const link = kpi.link(assetId);

  return (
    <Card className={cn('h-full gap-2 py-4 transition-colors hover:bg-accent/40', className)}>
      <Link {...(link as LinkProps)} className="flex h-full flex-col rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardHeader className="px-4">
          <CardDescription className="truncate">{title ?? kpi.label}</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">
            {summary.isPending ? (
              <Skeleton className="h-9 w-16" />
            ) : value === null || value === undefined ? (
              '—'
            ) : kpi.format ? (
              kpi.format(value)
            ) : (
              value.toLocaleString()
            )}
          </CardTitle>
          <p className="truncate text-xs text-muted-foreground">{summary.data ? kpi.hint(summary.data) : ' '}</p>
        </CardHeader>
      </Link>
    </Card>
  );
}
