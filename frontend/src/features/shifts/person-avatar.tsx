import type { ShiftRole } from '@gen-ui/shared';
import { SHIFT_ROLE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { initials, tint } from './calendar-utils';

/** Initials on the shift's colour. */
export function PersonAvatar({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold', className)}
      style={{ background: tint(color, 22), boxShadow: `inset 0 0 0 1px ${tint(color, 55)}` }}
    >
      {initials(name)}
    </span>
  );
}

/** Supervisor / On call; operators, the usual case, go without. */
export function RoleBadge({ role }: { role: ShiftRole }) {
  if (role === 'OPERATOR') return null;
  return (
    <span className="inline-flex h-4 items-center rounded-sm border px-1 text-[10px] font-medium leading-none text-foreground/80">
      {SHIFT_ROLE[role]}
    </span>
  );
}
