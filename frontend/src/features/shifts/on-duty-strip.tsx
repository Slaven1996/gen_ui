import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ShiftAssignment, ShiftRole } from '@gen-ui/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { SHIFT_ROLE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { onDutyQueryOptions } from './api';
import { formatClock } from './calendar-utils';
import { PersonAvatar } from './person-avatar';

/**
 * Who is on duty now — whom alarm escalation would page — and who takes over
 * next. The Shifts page shows both halves as its top band. The assistant
 * shows one (`only`) as a card in its answer, with its link as `action`. The
 * "On duty now" dashboard widget shows the first, `stacked` and unframed
 * inside the widget's own card.
 */
export function OnDutyStrip({
  only,
  role,
  action,
  stacked = false,
  framed = true,
}: {
  /** One half: who is on shift now, or who takes over next. Both without it. */
  only?: 'now' | 'next';
  /** Only people on shift in these roles. */
  role?: ShiftRole[];
  /** Shown in the top-right corner, e.g. a link to the page. */
  action?: ReactNode;
  /** One person per row, for a narrow tile. */
  stacked?: boolean;
  /** false: inside another card, which gives the title: no border, background or heading of its own. */
  framed?: boolean;
}) {
  const onDuty = useQuery(onDutyQueryOptions({ role }));
  if (onDuty.isPending) return <Skeleton className={stacked ? 'h-24' : 'h-16'} />;
  const data = onDuty.data;
  if (!data) return null;
  const handover = data.next[0];
  // Next to who is on now, the handover shows only once there is one.
  const showNext = only === 'next' || (only === undefined && handover !== undefined);
  const heading = (text: string) => (framed ? text : undefined);

  return (
    <section
      aria-label={only === 'next' ? 'Next on duty' : only === 'now' ? 'On duty now' : 'On duty'}
      className={cn('flex items-start gap-x-4', framed && 'rounded-lg border bg-card px-4 py-3')}
    >
      <div className={cn('flex min-w-0 flex-1 items-start gap-x-8 gap-y-3', stacked ? 'flex-col' : 'flex-wrap')}>
        {only !== 'next' && (
          <Half
            heading={heading('On duty now')}
            shifts={data.items}
            timeZone={data.timeZone}
            stacked={stacked}
            empty={<p className="text-sm text-destructive">Nobody is on shift right now.</p>}
          />
        )}
        {showNext && (
          <Half
            heading={heading(handover ? `Next, at ${formatClock(handover.startsAt, data.timeZone)}` : 'Next')}
            shifts={data.next}
            timeZone={data.timeZone}
            stacked={stacked}
            empty={<p className="text-sm text-muted-foreground">No shift starts in the next 24 hours.</p>}
          />
        )}
      </div>
      {action && <div className="-my-1 -mr-2 shrink-0">{action}</div>}
    </section>
  );
}

/** One half of the strip: its heading, and each person on it. */
function Half({
  heading,
  shifts,
  timeZone,
  stacked,
  empty,
}: {
  heading?: string;
  shifts: ShiftAssignment[];
  timeZone: string;
  stacked: boolean;
  empty: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', stacked && 'w-full')}>
      {heading && <h3 className="text-xs font-medium text-muted-foreground">{heading}</h3>}
      {shifts.length > 0 ? (
        <ul className={cn('flex gap-x-5 gap-y-2', stacked ? 'flex-col' : 'flex-wrap')}>
          {shifts.map((shift) => (
            <DutyPerson key={shift.id} shift={shift} detail={`until ${formatClock(shift.endsAt, timeZone)}`} />
          ))}
        </ul>
      ) : (
        empty
      )}
    </div>
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
