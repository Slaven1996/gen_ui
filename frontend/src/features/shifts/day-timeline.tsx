import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { SHIFT_ROLE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { formatClock, shiftTimes, tint, type CalendarViewProps, type ShiftPerson } from './calendar-utils';
import { PersonAvatar, RoleBadge } from './person-avatar';
import { CoverageSlot } from './shift-pieces';
import { ShiftPopover } from './shift-popover';

const HOUR_MS = 3_600_000;

/**
 * One day as a timeline from midnight to midnight in the plant time zone,
 * one row per person. The night that began the evening before shows from
 * 00:00; a shift running past midnight is cut at the edge. Positions come
 * from the day's real length, so a 23- or 25-hour day still lines up.
 */
export function DayTimeline({ calendar, model, actions, now }: CalendarViewProps & { now: Date }) {
  const day = calendar.days[0];
  if (!day) return null;
  const start = Date.parse(day.startsAt);
  const end = Date.parse(day.endsAt);
  const at = (instant: number) => ((instant - start) / (end - start)) * 100;
  // Every elapsed hour, labelled by the clock: 02:00 shows twice when the clocks go back.
  const ticks = Array.from({ length: Math.round((end - start) / HOUR_MS) }, (_, index) => start + index * HOUR_MS);
  const nowAt = now.getTime() >= start && now.getTime() < end ? at(now.getTime()) : undefined;

  const rows = new Map<string, { person: ShiftPerson; shifts: ShiftAssignment[] }>();
  for (const shift of calendar.items) {
    if (Date.parse(shift.endsAt) <= start || Date.parse(shift.startsAt) >= end) continue;
    const row = rows.get(shift.user.id) ?? { person: shift.user, shifts: [] };
    row.shifts.push(shift);
    rows.set(shift.user.id, row);
  }
  const gaps = model.shortfalls(day.date);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="min-w-[48rem]">
          <div className="grid grid-cols-[11rem_1fr] border-b">
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Person</div>
            <div className="relative h-7">
              {ticks.map((tick, index) =>
                index % 2 === 0 ? (
                  <span
                    key={tick}
                    className={cn('absolute top-1.5 text-[11px] text-muted-foreground tabular-nums', index > 0 && '-translate-x-1/2')}
                    style={{ left: `${at(tick)}%` }}
                  >
                    {formatClock(tick, calendar.timeZone)}
                  </span>
                ) : null,
              )}
            </div>
          </div>

          {[...rows.values()].map(({ person, shifts }) => (
            <div key={person.id} className="grid grid-cols-[11rem_1fr] border-b last:border-b-0">
              <div className="flex min-w-0 items-center gap-2 border-r px-3 py-2">
                <PersonAvatar name={person.name} color={shifts[0].template.color} className="size-6 text-[10px]" />
                <div className="min-w-0">
                  <div className={cn('truncate text-sm font-medium', !person.isActive && 'text-muted-foreground line-through')} title={person.name}>
                    {person.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[...new Set(shifts.map((shift) => SHIFT_ROLE[shift.role]))].join(', ')}
                  </div>
                </div>
              </div>
              <div className="relative h-14">
                {ticks.map((tick, index) =>
                  index > 0 ? (
                    <span key={tick} aria-hidden className="absolute inset-y-0 border-l border-border/50" style={{ left: `${at(tick)}%` }} />
                  ) : null,
                )}
                {shifts.map((shift) => (
                  <ShiftBar key={shift.id} shift={shift} timeZone={calendar.timeZone} actions={actions} start={start} end={end} at={at} />
                ))}
                {nowAt !== undefined && (
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-destructive" style={{ left: `${nowAt}%` }} />
                )}
              </div>
            </div>
          ))}
          {rows.size === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nobody is scheduled on this day.</p>}
        </div>
      </div>

      {gaps.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-dashed border-destructive/40 p-3">
          <p className="text-sm font-medium">Unfilled</p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {gaps.map((gap) => (
              <CoverageSlot
                key={`${gap.templateId}-${gap.role}`}
                shortfall={gap}
                templateName={model.templateById.get(gap.templateId)?.name}
                onSchedule={actions && (() => actions.schedule({ date: day.date, templateId: gap.templateId, role: gap.role }))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftBar({
  shift,
  timeZone,
  actions,
  start,
  end,
  at,
}: Pick<CalendarViewProps, 'actions'> & {
  shift: ShiftAssignment;
  timeZone: string;
  start: number;
  end: number;
  at: (instant: number) => number;
}) {
  const shiftStart = Date.parse(shift.startsAt);
  const shiftEnd = Date.parse(shift.endsAt);
  const fromBefore = shiftStart < start;
  const pastEnd = shiftEnd > end;
  const left = at(Math.max(shiftStart, start));
  const width = at(Math.min(shiftEnd, end)) - left;
  const times = shiftTimes(shift, timeZone);
  return (
    <ShiftPopover shift={shift} timeZone={timeZone} actions={actions}>
      <button
        type="button"
        className={cn(
          'absolute inset-y-2 flex items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-xs hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:brightness-125',
          fromBefore ? 'rounded-l-none' : 'border-l-4',
          pastEnd && 'rounded-r-none',
          !shift.user.isActive && 'opacity-60',
        )}
        style={{ left: `${left}%`, width: `${width}%`, borderLeftColor: shift.template.color, background: tint(shift.template.color, 20) }}
      >
        {fromBefore && <ChevronLeft className="size-3 shrink-0" aria-label="Started the day before" />}
        <span className="truncate font-medium">{shift.template.name}</span>
        <span className="truncate text-muted-foreground tabular-nums">
          {fromBefore ? `since ${formatClock(shiftStart, timeZone)}` : times.label}
        </span>
        <RoleBadge role={shift.role} />
        {pastEnd && <ChevronRight className="ml-auto size-3 shrink-0" aria-label="Continues the next day" />}
      </button>
    </ShiftPopover>
  );
}
