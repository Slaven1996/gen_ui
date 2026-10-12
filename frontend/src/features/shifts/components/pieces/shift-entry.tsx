import { MessageSquareText } from 'lucide-react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { hasOwnHours, shiftTimes } from '../../lib/calendar-utils';
import { ENTRY_BUTTON_CLASS } from '../../lib/entry-button';
import type { ShiftActions } from '../../types';
import { PersonAvatar } from './person-avatar';
import { RoleBadge } from './role-badge';
import { ShiftPopover } from './shift-popover';

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
      <button type="button" className={cn(ENTRY_BUTTON_CLASS, 'flex items-start gap-1.5 px-1.5 py-1 hover:bg-accent', !shift.user.isActive && 'opacity-60')}>
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
