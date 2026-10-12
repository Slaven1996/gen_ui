import { useState } from 'react';
import { templateTimes, type ShiftTemplate } from '@gen-ui/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatShortDate } from '../../lib/calendar-utils';
import type { CalendarViewProps } from '../../types';
import { CoverageSlot } from '../pieces/coverage-slot';
import { PersonAvatar } from '../pieces/person-avatar';
import { SlotPerson } from './slot-person';

const MAX_FACES = 3;

/** One template line in a day cell: faces, and a popover with everyone. */
export function MonthLine({
  calendar,
  model,
  actions,
  template,
  date,
}: Pick<CalendarViewProps, 'calendar' | 'model' | 'actions'> & { template: ShiftTemplate; date: string }) {
  const [open, setOpen] = useState(false);
  const shifts = model.shifts(date, template.id);
  const gaps = model.shortfalls(date, template.id);
  const times = templateTimes(template);
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full" style={{ background: template.color }} />
          <span className="min-w-0 flex-1 truncate">{template.name}</span>
          <span className="flex shrink-0 -space-x-1">
            {shifts.slice(0, MAX_FACES).map((shift) => (
              <PersonAvatar key={shift.id} name={shift.user.name} color={template.color} className="size-4 text-[7px] ring-1 ring-card" />
            ))}
          </span>
          {shifts.length > MAX_FACES && <span className="shrink-0 text-muted-foreground">+{shifts.length - MAX_FACES}</span>}
          {gaps.length > 0 && <span className="size-1.5 shrink-0 rounded-full bg-destructive" title="Someone is missing" />}
          <span className="sr-only">
            {shifts.map((shift) => shift.user.name).join(', ') || 'Nobody'}
            {gaps.length > 0 && ', understaffed'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: template.color }} />
            {template.name}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatShortDate(date)} · {times.label}
            {times.overnight && ' (next day)'}
          </div>
        </div>
        {shifts.length > 0 ? (
          <ul className="divide-y">
            {shifts.map((shift) => (
              <SlotPerson key={shift.id} shift={shift} timeZone={calendar.timeZone} actions={actions} onAction={run} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody is scheduled.</p>
        )}
        {gaps.map((gap) => (
          <CoverageSlot
            key={gap.role}
            shortfall={gap}
            onSchedule={actions && (() => run(() => actions.schedule({ date, templateId: template.id, role: gap.role })))}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
