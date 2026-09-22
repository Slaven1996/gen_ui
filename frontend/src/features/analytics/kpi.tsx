import { useQuery } from '@tanstack/react-query';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { AnalyticsSummary, KpiMetric } from '@gen-ui/shared';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { summaryQueryOptions } from './api';

interface KpiDefinition {
  label: string;
  value: (summary: AnalyticsSummary) => number | null;
  format?: (value: number) => string;
  hint: (summary: AnalyticsSummary) => string;
  /** The list that explains the number. */
  link: (assetId?: string) => Pick<LinkProps, 'to' | 'search'>;
}

const withAsset = (assetId?: string) => (assetId ? { assetId } : {});

/** Every metric a KPI tile can show, where its number comes from, and where it leads. */
export const KPIS: Record<KpiMetric, KpiDefinition> = {
  OPEN_ALARMS: {
    label: 'Open alarms',
    value: (s) => s.alarms.open,
    hint: (s) => `${s.alarms.active} with the condition still present`,
    link: (assetId) => ({ to: '/alarms', search: { state: ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED'], ...withAsset(assetId) } }),
  },
  ACTIVE_ALARMS: {
    label: 'Active alarms',
    value: (s) => s.alarms.active,
    hint: (s) => `${s.alarms.openBySeverity.CRITICAL} critical among the open ones`,
    link: (assetId) => ({ to: '/alarms', search: { state: ['ACTIVE', 'ACKNOWLEDGED'], ...withAsset(assetId) } }),
  },
  UNACKNOWLEDGED_ALARMS: {
    label: 'Unacknowledged',
    value: (s) => s.alarms.unacknowledged,
    hint: () => 'Waiting for someone to look',
    link: (assetId) => ({ to: '/alarms', search: { state: ['ACTIVE', 'CLEARED'], ...withAsset(assetId) } }),
  },
  CRITICAL_ALARMS: {
    label: 'Critical, open',
    value: (s) => s.alarms.openBySeverity.CRITICAL,
    hint: (s) => `${s.alarms.openBySeverity.HIGH} high`,
    link: (assetId) => ({
      to: '/alarms',
      search: { severity: ['CRITICAL'], state: ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED'], ...withAsset(assetId) },
    }),
  },
  ALARMS_LAST_24H: {
    label: 'Raised in 24 h',
    value: (s) => s.alarms.raisedLast24h,
    hint: () => 'Every alarm raised since this time yesterday',
    link: (assetId) => ({ to: '/alarms', search: { range: '24h', ...withAsset(assetId) } }),
  },
  MTTA: {
    label: 'Mean time to acknowledge',
    value: (s) => s.alarms.mttaMinutes,
    format: (minutes) => formatDuration(minutes),
    hint: () => 'Alarms raised in the last 7 days',
    link: (assetId) => ({ to: '/analytics', search: { range: '7d', ...withAsset(assetId) } }),
  },
  DEVICES_ONLINE: {
    label: 'Devices online',
    value: (s) => s.devices.byStatus.ONLINE,
    format: (value) => String(value),
    hint: (s) => `of ${s.devices.total} devices`,
    link: (assetId) => ({ to: '/devices', search: { status: ['ONLINE'], ...withAsset(assetId) } }),
  },
  DEVICES_OFFLINE: {
    label: 'Devices not reporting',
    value: (s) => s.devices.byStatus.OFFLINE + s.devices.byStatus.FAULT,
    hint: (s) => `${s.devices.byStatus.OFFLINE} offline · ${s.devices.byStatus.FAULT} faulted · ${s.devices.byStatus.MAINTENANCE} in maintenance`,
    link: (assetId) => ({ to: '/devices', search: { status: ['OFFLINE', 'FAULT'], ...withAsset(assetId) } }),
  },
  ASSETS: {
    label: 'Assets',
    value: (s) => s.assets,
    hint: (s) => `${s.tags} tags on ${s.devices.total} devices`,
    link: (assetId) => (assetId ? { to: '/assets', search: { ancestorId: assetId } } : { to: '/assets', search: {} }),
  },
  TAGS: {
    label: 'Tags',
    value: (s) => s.tags,
    hint: (s) => `on ${s.devices.total} devices`,
    link: (assetId) => ({ to: '/tags', search: withAsset(assetId) }),
  },
};

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
