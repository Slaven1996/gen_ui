import { useState, type ReactElement } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDuration } from '@/lib/format';
import { SHIFT_ROLE } from '@/lib/labels';
import { formatShortDate, shiftMinutes, shiftTimes } from './calendar-utils';
import { PersonAvatar } from './person-avatar';
import type { ShiftActions } from './use-shift-actions';

/** Everything about one shift, opened from wherever the calendar shows it. Admins also get Edit and Remove. */
export function ShiftPopover({
  shift,
  timeZone,
  actions,
  children,
}: {
  shift: ShiftAssignment;
  timeZone: string;
  actions?: ShiftActions;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: (shift: ShiftAssignment) => void) => () => {
    setOpen(false);
    action(shift);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <ShiftDetails shift={shift} timeZone={timeZone} />
        {actions && (
          <div className="mt-3 flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={run(actions.remove)}>
              <Trash2 />
              Remove
            </Button>
            <Button variant="outline" size="sm" onClick={run(actions.edit)}>
              <Pencil />
              Edit
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ShiftDetails({ shift, timeZone }: { shift: ShiftAssignment; timeZone: string }) {
  const times = shiftTimes(shift, timeZone);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <PersonAvatar name={shift.user.name} color={shift.template.color} className="size-9 text-xs" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <span className="truncate">{shift.user.name}</span>
            {!shift.user.isActive && <Badge variant="secondary">Deactivated</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">{SHIFT_ROLE[shift.role]}</div>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Shift</dt>
        <dd className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: shift.template.color }} />
          {shift.template.name}
        </dd>
        <dt className="text-muted-foreground">When</dt>
        <dd className="tabular-nums">
          {formatShortDate(shift.date)} · {times.label}
          {times.overnight && ' (next day)'} · {formatDuration(shiftMinutes(shift))}
        </dd>
        {shift.notes && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{shift.notes}</dd>
          </>
        )}
        {shift.seriesId && (
          <>
            <dt className="text-muted-foreground">Repeats</dt>
            <dd>Part of a series</dd>
          </>
        )}
        {shift.createdBy && (
          <>
            <dt className="text-muted-foreground">Planned by</dt>
            <dd>{shift.createdBy.name}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
