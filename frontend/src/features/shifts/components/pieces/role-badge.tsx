import type { ShiftRole } from '@gen-ui/shared';
import { SHIFT_ROLE } from '@/lib/labels';

/** Supervisor / On call; operators, the usual case, go without. */
export function RoleBadge({ role }: { role: ShiftRole }) {
  if (role === 'OPERATOR') return null;
  return (
    <span className="inline-flex h-4 items-center rounded-sm border px-1 text-[10px] font-medium leading-none text-foreground/80">
      {SHIFT_ROLE[role]}
    </span>
  );
}
