import type { ReactNode } from 'react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { formatClock } from '../../lib/calendar-utils';
import { DutyPerson } from './duty-person';

/** One half of the strip: its heading, and each person on it. */
/** One half of the strip: who is on now, or next. */
export function OnDutyHalf({
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
