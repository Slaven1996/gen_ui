import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { formatClock, shiftTimes, tint } from '../../lib/calendar-utils';
import type { CalendarViewProps } from '../../types';
import { RoleBadge } from '../pieces/role-badge';
import { ShiftPopover } from '../pieces/shift-popover';

/** One shift as a bar on the day timeline. */
export function ShiftBar({
  shift,
  timeZone,
  actions,
  start,
  end,
  at,
}: Pick<CalendarViewProps, 'actions'> & {
  shift: ShiftAssignment;
  timeZone: string;
  start: number;
  end: number;
  at: (instant: number) => number;
}) {
  const shiftStart = Date.parse(shift.startsAt);
  const shiftEnd = Date.parse(shift.endsAt);
  const fromBefore = shiftStart < start;
  const pastEnd = shiftEnd > end;
  const left = at(Math.max(shiftStart, start));
  const width = at(Math.min(shiftEnd, end)) - left;
  const times = shiftTimes(shift, timeZone);
  return (
    <ShiftPopover shift={shift} timeZone={timeZone} actions={actions}>
      <button
        type="button"
        className={cn(
          'absolute inset-y-2 flex items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-xs hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:brightness-125',
          fromBefore ? 'rounded-l-none' : 'border-l-4',
          pastEnd && 'rounded-r-none',
          !shift.user.isActive && 'opacity-60',
        )}
        style={{ left: `${left}%`, width: `${width}%`, borderLeftColor: shift.template.color, background: tint(shift.template.color, 20) }}
      >
        {fromBefore && <ChevronLeft className="size-3 shrink-0" aria-label="Started the day before" />}
        <span className="truncate font-medium">{shift.template.name}</span>
        <span className="truncate text-muted-foreground tabular-nums">
          {fromBefore ? `since ${formatClock(shiftStart, timeZone)}` : times.label}
        </span>
        <RoleBadge role={shift.role} />
        {pastEnd && <ChevronRight className="ml-auto size-3 shrink-0" aria-label="Continues the next day" />}
      </button>
    </ShiftPopover>
  );
}
