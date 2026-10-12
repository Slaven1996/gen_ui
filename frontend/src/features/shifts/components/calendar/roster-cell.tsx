import type { ShiftCalendarDay, ShiftTemplate } from '@gen-ui/shared';
import type { CalendarViewProps } from '../../types';
import { CoverageSlot } from '../pieces/coverage-slot';
import { ShiftEntry } from '../pieces/shift-entry';

/** One template on one day: its shifts and gaps. */
export function RosterCell({ calendar, model, actions, template, day }: CalendarViewProps & { template: ShiftTemplate; day: ShiftCalendarDay }) {
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
