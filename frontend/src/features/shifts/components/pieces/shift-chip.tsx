import { MessageSquareText } from 'lucide-react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { shiftTimes, tint } from '../../lib/calendar-utils';
import { ENTRY_BUTTON_CLASS } from '../../lib/entry-button';
import type { ShiftActions } from '../../types';
import { RoleBadge } from './role-badge';
import { ShiftPopover } from './shift-popover';

/** One shift in a person's row: which shift, its hours and role. */
export function ShiftChip({ shift, timeZone, actions }: { shift: ShiftAssignment; timeZone: string; actions?: ShiftActions }) {
  const times = shiftTimes(shift, timeZone);
  return (
    <ShiftPopover shift={shift} timeZone={timeZone} actions={actions}>
      <button
        type="button"
        className={cn(ENTRY_BUTTON_CLASS, 'border-l-[3px] px-1.5 py-1 hover:brightness-95 dark:hover:brightness-125', !shift.user.isActive && 'opacity-60')}
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
