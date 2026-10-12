import { Pencil, Trash2 } from 'lucide-react';
import type { ShiftAssignment } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { SHIFT_ROLE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { hasOwnHours, shiftTimes } from '../../lib/calendar-utils';
import type { ShiftActions } from '../../types';
import { PersonAvatar } from '../pieces/person-avatar';
import { RoleBadge } from '../pieces/role-badge';

/** One person in a month line popover. */
export function SlotPerson({
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
