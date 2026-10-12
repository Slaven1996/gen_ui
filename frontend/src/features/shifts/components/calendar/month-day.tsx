import type { ShiftCalendarDay } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { dayOfMonth, formatShortDate, missingCount } from '../../lib/calendar-utils';
import type { CalendarViewProps } from '../../types';
import { GapCount } from '../pieces/gap-count';
import { MonthLine } from './month-line';

/** One day cell of the month grid. */
export function MonthDay({
  calendar,
  model,
  actions,
  onOpenDay,
  day,
  outside,
  isToday,
  firstInRow,
}: CalendarViewProps & { day: ShiftCalendarDay; outside: boolean; isToday: boolean; firstInRow: boolean }) {
  const lines = calendar.templates.filter(
    (template) =>
      model.runsOn(template, day.date) ||
      model.shifts(day.date, template.id).length > 0 ||
      model.shortfalls(day.date, template.id).length > 0,
  );
  const dayNumber = cn(
    'min-w-6 rounded-md px-1 text-sm font-medium tabular-nums',
    outside && 'text-muted-foreground',
    isToday && 'bg-primary text-primary-foreground',
  );
  return (
    <div
      className={cn('min-h-28 border-b p-1', !firstInRow && 'border-l', outside && 'bg-muted/30')}
      aria-current={isToday ? 'date' : undefined}
    >
      <div className="mb-0.5 flex items-center justify-between gap-1">
        {onOpenDay ? (
          <button
            type="button"
            onClick={() => onOpenDay(day.date)}
            className={cn(
              dayNumber,
              'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isToday && 'hover:bg-primary/90',
            )}
            title={`Open ${formatShortDate(day.date)}`}
          >
            {dayOfMonth(day.date)}
          </button>
        ) : (
          <span className={dayNumber}>{dayOfMonth(day.date)}</span>
        )}
        <GapCount count={missingCount(model.shortfalls(day.date))} />
      </div>

      {/* Phones: one dot per shift, red where someone is missing. */}
      <div className="flex flex-wrap gap-1 px-1 md:hidden" aria-hidden>
        {lines.map((template) => (
          <span
            key={template.id}
            className={cn('size-2 rounded-full', model.shortfalls(day.date, template.id).length > 0 && 'ring-2 ring-destructive')}
            style={{ background: template.color }}
          />
        ))}
      </div>

      <div className="hidden space-y-px md:block">
        {lines.map((template) => (
          <MonthLine key={template.id} calendar={calendar} model={model} actions={actions} template={template} date={day.date} />
        ))}
      </div>
    </div>
  );
}
