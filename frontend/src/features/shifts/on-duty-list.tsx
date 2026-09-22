import { useQuery } from '@tanstack/react-query';
import type { OnDutyQueryInput } from '@gen-ui/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTime } from '@/lib/format';
import { SHIFT_ROLE } from '@/lib/labels';
import { onDutyQueryOptions } from './api';

/** Who is on shift right now, with their shift and when it ends. */
export function OnDutyList({ query = {} }: { query?: OnDutyQueryInput }) {
  const onDuty = useQuery(onDutyQueryOptions(query));
  if (onDuty.isPending) return <Skeleton className="h-24" />;
  if (!onDuty.data?.items.length) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Nobody is scheduled right now.</p>;
  }
  return (
    <ul className="divide-y">
      {onDuty.data.items.map((assignment) => (
        <li key={assignment.id} className="flex items-center gap-3 py-2">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: assignment.template.color }}
          >
            {assignment.user.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{assignment.user.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {SHIFT_ROLE[assignment.role]} · {assignment.template.name}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">until {formatTime(assignment.endsAt)}</span>
        </li>
      ))}
    </ul>
  );
}
