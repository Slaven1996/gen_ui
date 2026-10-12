import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DEVICE_STATUSES } from '@gen-ui/shared';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DEVICE_STATUS } from '@/lib/labels';
import { summaryQueryOptions } from '../api/queries';

const BAR_COLOR = {
  good: 'bg-status-good',
  serious: 'bg-status-serious',
  info: 'bg-status-info',
  critical: 'bg-status-critical',
  warning: 'bg-status-warning',
  neutral: 'bg-status-neutral',
} as const;

/** Device health: one proportion bar, then a labelled count per status linking to that list. */
export function DeviceStatusSummary({ assetId }: { assetId?: string }) {
  const summary = useQuery(summaryQueryOptions(assetId));
  if (summary.isPending) return <Skeleton className="h-32" />;
  if (!summary.data) return null;

  const { total, byStatus } = summary.data.devices;

  return (
    <div className="space-y-4">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Devices by status">
        {DEVICE_STATUSES.filter((status) => byStatus[status] > 0).map((status) => (
          <div
            key={status}
            className={BAR_COLOR[DEVICE_STATUS[status].tone]}
            style={{ width: `${(byStatus[status] / Math.max(total, 1)) * 100}%` }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {DEVICE_STATUSES.map((status) => {
          const presentation = DEVICE_STATUS[status];
          return (
            <li key={status}>
              <Link
                to="/devices"
                search={{ status: [status], ...(assetId && { assetId }) }}
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 hover:bg-accent"
              >
                <StatusBadge tone={presentation.tone} icon={presentation.icon} label={presentation.label} />
                <span className="text-lg font-semibold tabular-nums">{byStatus[status]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
