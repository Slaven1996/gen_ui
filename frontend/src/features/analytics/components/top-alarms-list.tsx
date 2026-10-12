import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TopAlarmsQueryInput } from '@gen-ui/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api/errors';
import { formatRelative, humanize } from '@/lib/format';
import { topAlarmsQueryOptions } from '../api/queries';

/**
 * The rules (or assets) raising the most alarms, as a ranked bar list: one
 * hue, the bar length is the count, and the count is written beside it. Each
 * row opens the alarm list filtered to it, over the same window.
 */
export function TopAlarmsList({ query }: { query: TopAlarmsQueryInput }) {
  const top = useQuery(topAlarmsQueryOptions(query));

  if (top.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(top.error)}</AlertDescription>
      </Alert>
    );
  }
  if (top.isPending) return <Skeleton className="h-40" />;
  if (top.data.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No alarms in this window.</p>;

  const max = Math.max(...top.data.map((item) => item.count));
  const window = { range: query.range ?? '30d', from: query.from, to: query.to };

  return (
    <ol className="space-y-2.5">
      {top.data.map((item) => (
        <li key={item.id}>
          <Link
            to="/alarms"
            search={query.groupBy === 'asset' ? { assetId: item.id, ...window } : { definitionId: [item.id], ...window }}
            className="group block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium group-hover:underline">{item.name}</span>
              <span className="shrink-0 font-medium tabular-nums">{item.count}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.detail && (query.groupBy === 'asset' ? humanize(item.detail) : item.detail)} · last{' '}
              {formatRelative(item.lastRaisedAt)}
            </p>
          </Link>
        </li>
      ))}
    </ol>
  );
}
