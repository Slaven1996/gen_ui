import { cn } from '@/lib/utils';
import { missingCount } from '../../lib/calendar-utils';
import type { CalendarViewProps } from '../../types';
import { CoverageSlot } from '../pieces/coverage-slot';
import { ShiftChip } from '../pieces/shift-chip';
import { DayHeader } from './day-header';
import { PersonHeader } from './person-header';

/**
 * The week per person: one row each, with their shifts as chips and their
 * hours for the week. Unmet staffing targets get a row of their own at the
 * bottom, so the gaps stay in sight.
 */
export function WeekByPerson(props: CalendarViewProps) {
  const { calendar, model, today, actions } = props;
  const hasGaps = calendar.days.some((day) => model.shortfalls(day.date).length > 0);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[52rem] table-fixed border-collapse">
        <colgroup>
          <col className="w-44" />
          {calendar.days.map((day) => (
            <col key={day.date} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Person
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
          {model.people.map((person) => (
            <tr key={person.id} className="border-b last:border-b-0">
              <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                <PersonHeader {...props} person={person} />
              </th>
              {calendar.days.map((day) => (
                <td key={day.date} className={cn('border-l p-1 align-top', day.date === today && 'bg-muted/40')}>
                  <div className="space-y-1">
                    {model.shiftsOf(person.id, day.date).map((shift) => (
                      <ShiftChip key={shift.id} shift={shift} timeZone={calendar.timeZone} actions={actions} />
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
          {hasGaps && (
            <tr className="border-t-2 border-dashed">
              <th scope="row" className="px-3 py-2 text-left align-top text-sm font-medium text-destructive">
                Unfilled
              </th>
              {calendar.days.map((day) => (
                <td key={day.date} className={cn('border-l p-1 align-top', day.date === today && 'bg-muted/40')}>
                  <div className="space-y-1">
                    {model.shortfalls(day.date).map((gap) => (
                      <CoverageSlot
                        key={`${gap.templateId}-${gap.role}`}
                        shortfall={gap}
                        templateName={model.templateById.get(gap.templateId)?.name}
                        onSchedule={
                          actions && (() => actions.schedule({ date: day.date, templateId: gap.templateId, role: gap.role }))
                        }
                      />
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {model.people.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Nobody is scheduled this week.</p>
      )}
    </div>
  );
}
