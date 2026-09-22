import { useQuery } from '@tanstack/react-query';
import type { ListShiftAssignmentsQueryInput, ShiftAssignment } from '@gen-ui/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTime } from '@/lib/format';
import { SHIFT_ROLE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { shiftAssignmentsQueryOptions } from './api';
import { addDays, toDateKey, weekDays } from './week';

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/**
 * A week of shifts, one column per day. A shift sits on the day it starts; a
 * night shift that ends the next morning says so. Filters (people, roles)
 * come in as the same query the API takes.
 */
export function WeekCalendar({
  weekStart,
  filters,
  onAssignmentClick,
}: {
  weekStart: Date;
  filters?: Pick<ListShiftAssignmentsQueryInput, 'userId' | 'role' | 'templateId'>;
  onAssignmentClick?: (assignment: ShiftAssignment) => void;
}) {
  const days = weekDays(weekStart);
  const assignments = useQuery(
    shiftAssignmentsQueryOptions({
      ...filters,
      from: weekStart.toISOString(),
      to: addDays(weekStart, 7).toISOString(),
      pageSize: 500,
    }),
  );
  const today = toDateKey(new Date());

  const byDay = new Map<string, ShiftAssignment[]>();
  for (const assignment of assignments.data?.items ?? []) {
    const key = toDateKey(new Date(assignment.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), assignment]);
  }

  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((day) => {
        const key = toDateKey(day);
        const items = byDay.get(key) ?? [];
        return (
          <section
            key={key}
            aria-label={day.toDateString()}
            className={cn('min-h-40 rounded-lg border bg-card p-2', key === today && 'border-foreground/40 ring-1 ring-foreground/10')}
          >
            <header className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium">{dayFormat.format(day)}</span>
              <span className={cn('text-xs text-muted-foreground', key === today && 'font-semibold text-foreground')}>
                {key === today ? 'Today' : dateFormat.format(day)}
              </span>
            </header>
            {assignments.isPending ? (
              <Skeleton className="h-16" />
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No shifts</p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((assignment) => {
                  const endsNextDay = toDateKey(new Date(assignment.endsAt)) !== key;
                  return (
                    <li key={assignment.id}>
                      <button
                        type="button"
                        disabled={!onAssignmentClick}
                        onClick={() => onAssignmentClick?.(assignment)}
                        className="w-full rounded-md border-l-4 bg-muted/60 px-2 py-1 text-left text-xs enabled:hover:bg-muted"
                        style={{ borderLeftColor: assignment.template.color }}
                      >
                        <div className="truncate font-medium">{assignment.user.name}</div>
                        <div className="truncate text-muted-foreground">
                          {assignment.template.name} · {formatTime(assignment.startsAt)}–{formatTime(assignment.endsAt)}
                          {endsNextDay && ' (+1)'}
                        </div>
                        {assignment.role !== 'OPERATOR' && <div className="truncate text-muted-foreground">{SHIFT_ROLE[assignment.role]}</div>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
