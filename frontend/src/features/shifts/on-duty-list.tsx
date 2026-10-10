import { useQuery } from '@tanstack/react-query';
import type { OnDutyQueryInput } from '@gen-ui/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { SHIFT_ROLE } from '@/lib/labels';
import { onDutyQueryOptions } from './api';
import { formatClock } from './calendar-utils';
import { PersonAvatar } from './person-avatar';

/** Who is on shift right now, with their shift and when it ends (plant time). The "On duty now" widget. */
export function OnDutyList({ query = {} }: { query?: OnDutyQueryInput }) {
  const onDuty = useQuery(onDutyQueryOptions(query));
  if (onDuty.isPending) return <Skeleton className="h-24" />;
  if (!onDuty.data?.items.length) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Nobody is scheduled right now.</p>;
  }
  const { timeZone } = onDuty.data;
  return (
    <ul className="divide-y">
      {onDuty.data.items.map((assignment) => (
        <li key={assignment.id} className="flex items-center gap-3 py-2">
          <PersonAvatar name={assignment.user.name} color={assignment.template.color} className="size-8 text-xs" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{assignment.user.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {SHIFT_ROLE[assignment.role]} · {assignment.template.name}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            until {formatClock(assignment.endsAt, timeZone)}
          </span>
        </li>
      ))}
    </ul>
  );
}
