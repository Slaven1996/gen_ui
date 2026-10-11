import { CircleAlert, MessageSquareText, UserPlus } from 'lucide-react';
import { templateTimes, type ShiftAssignment, type ShiftCoverage, type ShiftTemplate } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { coverageSummary, hasOwnHours, shiftTimes, shortfallLabel, tint } from './calendar-utils';
import { PersonAvatar, RoleBadge } from './person-avatar';
import { ShiftPopover } from './shift-popover';
import type { ShiftActions } from './use-shift-actions';

/** A template's colour, name, hours and staffing target: the row header of the roster. */
export function TemplateLabel({ template }: { template: ShiftTemplate }) {
  const times = templateTimes(template);
  return (
    <div className="flex gap-2">
      <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ background: template.color }} />
      <div className="min-w-0 space-y-0.5">
        <div className="truncate text-sm font-medium" title={template.name}>
          {template.name}
          {!template.isActive && <span className="font-normal text-muted-foreground"> (inactive)</span>}
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {times.label}
          {times.overnight && <sup className="ml-0.5">+1</sup>}
        </div>
        {template.coverage.length > 0 && (
          <div className="text-[11px] leading-snug text-muted-foreground">{coverageSummary(template.coverage)}</div>
        )}
      </div>
    </div>
  );
}

/** How many people are still missing that day. */
export function GapCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 text-[11px] font-medium tabular-nums text-destructive"
      title={`${count} ${count === 1 ? 'person' : 'people'} missing`}
    >
      <CircleAlert className="size-3" />
      {count}
    </span>
  );
}

/** An unmet staffing target; for admins, a button that schedules someone into it. */
export function CoverageSlot({
  shortfall,
  templateName,
  onSchedule,
}: {
  shortfall: ShiftCoverage;
  /** Shown where the row doesn't already say which shift it is. */
  templateName?: string;
  onSchedule?: () => void;
}) {
  const label = `${templateName ? `${templateName}: ` : ''}${shortfallLabel(shortfall)}`;
  const className =
    'flex w-full items-center gap-1.5 rounded-md border border-dashed border-destructive/50 px-1.5 py-1 text-left text-xs text-destructive';
  if (!onSchedule) {
    return (
      <div className={className}>
        <CircleAlert className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn(className, 'hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}
      onClick={onSchedule}
      title="Schedule someone"
    >
      <UserPlus className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

const entryButton =
  'w-full rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * One person on a shift, inside a roster cell that already says which shift
 * it is: their name, and only what's out of the ordinary (role, own hours, notes).
 */
export function ShiftEntry({ shift, timeZone, actions }: { shift: ShiftAssignment; timeZone: string; actions?: ShiftActions }) {
  const ownHours = hasOwnHours(shift, timeZone);
  const times = shiftTimes(shift, timeZone);
  const extra = shift.role !== 'OPERATOR' || ownHours || shift.notes;
  return (
    <ShiftPopover shift={shift} timeZone={timeZone} actions={actions}>
      <button type="button" className={cn(entryButton, 'flex items-start gap-1.5 px-1.5 py-1 hover:bg-accent', !shift.user.isActive && 'opacity-60')}>
        <PersonAvatar name={shift.user.name} color={shift.template.color} className="mt-px" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[13px] leading-5 font-medium', !shift.user.isActive && 'line-through')} title={shift.user.name}>
            {shift.user.name}
          </span>
          {extra && (
            <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
              <RoleBadge role={shift.role} />
              {ownHours && (
                <span>
                  {times.label}
                  {times.overnight && <sup>+1</sup>}
                </span>
              )}
              {shift.notes && <MessageSquareText className="size-3" aria-label="Has notes" />}
            </span>
          )}
        </span>
      </button>
    </ShiftPopover>
  );
}

/** One shift in a person's row: which shift, its hours and role. */
export function ShiftChip({ shift, timeZone, actions }: { shift: ShiftAssignment; timeZone: string; actions?: ShiftActions }) {
  const times = shiftTimes(shift, timeZone);
  return (
    <ShiftPopover shift={shift} timeZone={timeZone} actions={actions}>
      <button
        type="button"
        className={cn(entryButton, 'border-l-[3px] px-1.5 py-1 hover:brightness-95 dark:hover:brightness-125', !shift.user.isActive && 'opacity-60')}
        style={{ borderLeftColor: shift.template.color, background: tint(shift.template.color, 14) }}
      >
        <span className="flex items-center gap-1">
          <span className="min-w-0 truncate text-[13px] leading-5 font-medium">{shift.template.name}</span>
          {shift.notes && <MessageSquareText className="size-3 shrink-0 text-muted-foreground" aria-label="Has notes" />}
        </span>
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
          <span>
            {times.label}
            {times.overnight && <sup>+1</sup>}
          </span>
          <RoleBadge role={shift.role} />
        </span>
      </button>
    </ShiftPopover>
  );
}
