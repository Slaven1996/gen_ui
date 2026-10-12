import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { shiftMinutes } from '../../lib/calendar-utils';
import type { CalendarViewProps, ShiftPerson } from '../../types';

/** A person row header in the week-by-person view. */
export function PersonHeader({ calendar, model, person }: CalendarViewProps & { person: ShiftPerson }) {
  const minutes = calendar.days
    .flatMap((day) => model.shiftsOf(person.id, day.date))
    .reduce((sum, shift) => sum + shiftMinutes(shift), 0);
  return (
    <div className="min-w-0">
      <div className={cn('truncate text-sm font-medium', !person.isActive && 'text-muted-foreground line-through')} title={person.name}>
        {person.name}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {person.isActive ? `${formatDuration(minutes)} this week` : 'Deactivated'}
      </div>
    </div>
  );
}
