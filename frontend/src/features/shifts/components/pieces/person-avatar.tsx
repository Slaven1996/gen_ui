import { cn } from '@/lib/utils';
import { initials, tint } from '../../lib/calendar-utils';

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
