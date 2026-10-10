import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { ShiftAssignment, ShiftCalendarDay, ShiftTemplate } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SHIFT_ROLE, WEEKDAYS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import {
  dayOfMonth,
  formatShortDate,
  hasOwnHours,
  missingCount,
  shiftTimes,
  templateTimes,
  type CalendarViewProps,
} from './calendar-utils';
import { PersonAvatar, RoleBadge } from './person-avatar';
import { CoverageSlot, GapCount } from './shift-pieces';
import type { ShiftActions } from './use-shift-actions';

const MAX_FACES = 3;

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

function MonthDay({
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
  return (
    <div
      className={cn('min-h-28 border-b p-1', !firstInRow && 'border-l', outside && 'bg-muted/30')}
      aria-current={isToday ? 'date' : undefined}
    >
      <div className="mb-0.5 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => onOpenDay(day.date)}
          className={cn(
            'min-w-6 rounded-md px-1 text-sm font-medium tabular-nums hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            outside && 'text-muted-foreground',
            isToday && 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
          title={`Open ${formatShortDate(day.date)}`}
        >
          {dayOfMonth(day.date)}
        </button>
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

function MonthLine({
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

function SlotPerson({
  shift,
  timeZone,
  actions,
  onAction,
}: {
  shift: ShiftAssignment;
  timeZone: string;
  actions?: ShiftActions;
  onAction: (action: () => void) => void;
}) {
  const times = shiftTimes(shift, timeZone);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <PersonAvatar name={shift.user.name} color={shift.template.color} className="size-6 text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-sm font-medium', !shift.user.isActive && 'text-muted-foreground line-through')}>
          {shift.user.name}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground tabular-nums">
          {shift.role === 'OPERATOR' ? SHIFT_ROLE.OPERATOR : <RoleBadge role={shift.role} />}
          {hasOwnHours(shift, timeZone) && <span>· {times.label}</span>}
          {shift.notes && <span className="truncate">· {shift.notes}</span>}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0">
          <Button variant="ghost" size="icon-xs" aria-label={`Edit ${shift.user.name}’s shift`} onClick={() => onAction(() => actions.edit(shift))}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:text-destructive"
            aria-label={`Remove ${shift.user.name}’s shift`}
            onClick={() => onAction(() => actions.remove(shift))}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}
