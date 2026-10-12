import type { ShiftAssignment } from '@gen-ui/shared';
import { SHIFT_ROLE } from '@/lib/labels';
import { PersonAvatar } from '../pieces/person-avatar';

/** One person on duty, with their shift detail. */
export function DutyPerson({ shift, detail }: { shift: ShiftAssignment; detail: string }) {
  return (
    <li className="flex items-center gap-2">
      <PersonAvatar name={shift.user.name} color={shift.template.color} className="size-8 text-xs" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{shift.user.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {SHIFT_ROLE[shift.role]} · {shift.template.name} · {detail}
        </div>
      </div>
    </li>
  );
}
