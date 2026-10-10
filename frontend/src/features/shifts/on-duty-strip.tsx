import { useQuery } from '@tanstack/react-query';
import type { ShiftAssignment } from '@gen-ui/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { SHIFT_ROLE } from '@/lib/labels';
import { onDutyQueryOptions } from './api';
import { formatClock } from './calendar-utils';
import { PersonAvatar } from './person-avatar';

/** The Shifts page's top band: who is on duty now — whom alarm escalation would page — and who takes over next. */
export function OnDutyStrip() {
  const onDuty = useQuery(onDutyQueryOptions());
  if (onDuty.isPending) return <Skeleton className="h-16" />;
  const data = onDuty.data;
  if (!data) return null;
  const handover = data.next[0];

  return (
    <section aria-label="On duty" className="flex flex-wrap items-start gap-x-8 gap-y-3 rounded-lg border bg-card px-4 py-3">
      <div className="space-y-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">On duty now</h3>
        {data.items.length > 0 ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {data.items.map((shift) => (
              <DutyPerson key={shift.id} shift={shift} detail={`until ${formatClock(shift.endsAt, data.timeZone)}`} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-destructive">Nobody is on shift right now.</p>
        )}
      </div>
      {handover && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Next, at {formatClock(handover.startsAt, data.timeZone)}</h3>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {data.next.map((shift) => (
              <DutyPerson key={shift.id} shift={shift} detail={`until ${formatClock(shift.endsAt, data.timeZone)}`} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DutyPerson({ shift, detail }: { shift: ShiftAssignment; detail: string }) {
  return (
    <li className="flex items-center gap-2">
      <PersonAvatar name={shift.user.name} color={shift.template.color} className="size-8 text-xs" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{shift.user.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {SHIFT_ROLE[shift.role]} · {shift.template.name} · {detail}
        </div>
      </div>
    </li>
  );
}
