import { cn } from '@/lib/utils';
import { missingCount } from '../../lib/calendar-utils';
import type { CalendarViewProps } from '../../types';
import { TemplateLabel } from '../pieces/template-label';
import { DayHeader } from './day-header';
import { RosterCell } from './roster-cell';

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
