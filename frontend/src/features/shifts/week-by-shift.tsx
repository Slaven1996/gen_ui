import type { ShiftCalendarDay, ShiftTemplate } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { dayOfMonth, formatShortDate, formatWeekday, missingCount, type CalendarViewProps } from './calendar-utils';
import { CoverageSlot, GapCount, ShiftEntry, TemplateLabel } from './shift-pieces';

/**
 * The week as a roster: one row per shift, one column per day. The row header
 * carries the shift's hours, so a cell only needs who is on it — and, where a
 * staffing target isn't met, a slot saying who is missing.
 */
export function WeekByShift(props: CalendarViewProps) {
  const { calendar, model, today } = props;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[52rem] table-fixed border-collapse">
        <colgroup>
          <col className="w-40" />
          {calendar.days.map((day) => (
            <col key={day.date} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Shift
            </th>
            {calendar.days.map((day) => (
              <DayHeader
                key={day.date}
                date={day.date}
                today={today}
                missing={missingCount(model.shortfalls(day.date))}
                onOpen={props.onOpenDay}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {calendar.templates.map((template) => (
            <tr key={template.id} className="border-b last:border-b-0">
              <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                <TemplateLabel template={template} />
              </th>
              {calendar.days.map((day) => (
                <td key={day.date} className={cn('border-l p-1 align-top', day.date === today && 'bg-muted/40')}>
                  <RosterCell {...props} template={template} day={day} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {calendar.templates.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No shifts are set up yet. Admins add them under Templates.</p>
      )}
    </div>
  );
}

function RosterCell({ calendar, model, actions, template, day }: CalendarViewProps & { template: ShiftTemplate; day: ShiftCalendarDay }) {
  const shifts = model.shifts(day.date, template.id);
  const gaps = model.shortfalls(day.date, template.id);
  if (shifts.length === 0 && gaps.length === 0) {
    return model.runsOn(template, day.date) ? null : (
      <span className="block py-1 text-center text-muted-foreground/40" title="Not run on this day">
        —
      </span>
    );
  }
  return (
    <div className="space-y-0.5">
      {shifts.map((shift) => (
        <ShiftEntry key={shift.id} shift={shift} timeZone={calendar.timeZone} actions={actions} />
      ))}
      {gaps.map((gap) => (
        <CoverageSlot
          key={gap.role}
          shortfall={gap}
          onSchedule={actions && (() => actions.schedule({ date: day.date, templateId: template.id, role: gap.role }))}
        />
      ))}
    </div>
  );
}

/** A day's column header: weekday, date (opens the day), and how many people it is short. */
export function DayHeader({
  date,
  today,
  missing,
  onOpen,
}: {
  date: string;
  today: string;
  missing: number;
  onOpen: (date: string) => void;
}) {
  const isToday = date === today;
  return (
    <th scope="col" className={cn('border-l p-1 text-left font-normal', isToday && 'bg-muted/40')} aria-current={isToday ? 'date' : undefined}>
      <button
        type="button"
        onClick={() => onOpen(date)}
        className="w-full rounded-md px-2 py-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        title={`Open ${formatShortDate(date)}`}
      >
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
      </button>
    </th>
  );
}
