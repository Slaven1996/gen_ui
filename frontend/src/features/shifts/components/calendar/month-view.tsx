import { WEEKDAYS } from '@/lib/labels';
import type { CalendarViewProps } from '../../types';
import { MonthDay } from './month-day';

/**
 * The month at a glance: per day, one line per shift with the initials of
 * who is on it and a red dot where someone is missing. A line opens the
 * shift's people for that day; the date opens the day.
 */
export function MonthView(props: CalendarViewProps) {
  const { calendar, today } = props;
  const month = calendar.date.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((day) => (
          <div key={day.value} className="px-2 py-1.5">
            {day.label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {calendar.days.map((day, index) => (
          <MonthDay
            key={day.date}
            {...props}
            day={day}
            outside={day.date.slice(0, 7) !== month}
            isToday={day.date === today}
            firstInRow={index % 7 === 0}
          />
        ))}
      </div>
    </div>
  );
}
