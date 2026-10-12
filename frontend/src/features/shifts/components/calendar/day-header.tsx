import { cn } from '@/lib/utils';
import { dayOfMonth, formatShortDate, formatWeekday } from '../../lib/calendar-utils';
import { GapCount } from '../pieces/gap-count';

/** A day's column header: weekday, date (opens the day, given `onOpen`), and how many people it is short. */
export function DayHeader({
  date,
  today,
  missing,
  onOpen,
}: {
  date: string;
  today: string;
  missing: number;
  onOpen?: (date: string) => void;
}) {
  const isToday = date === today;
  const content = (
    <>
      <span className="flex items-center justify-between gap-1">
        <span className={cn('text-xs text-muted-foreground', isToday && 'font-medium text-foreground')}>
          {formatWeekday(date)}
          {isToday && ' · Today'}
        </span>
        <GapCount count={missing} />
      </span>
      <span className={cn('block text-lg leading-tight font-semibold tabular-nums', !isToday && 'text-foreground/80')}>
        {dayOfMonth(date)}
      </span>
    </>
  );
  return (
    <th scope="col" className={cn('border-l p-1 text-left font-normal', isToday && 'bg-muted/40')} aria-current={isToday ? 'date' : undefined}>
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(date)}
          className="w-full rounded-md px-2 py-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          title={`Open ${formatShortDate(date)}`}
        >
          {content}
        </button>
      ) : (
        <div className="px-2 py-1">{content}</div>
      )}
    </th>
  );
}
