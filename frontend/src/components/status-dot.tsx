import { cn } from '@/lib/utils';
import type { StatusTone } from './status-badge';

/** A small dot for dense places (tree rows, legends); always next to a text label. */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  const color: Record<StatusTone, string> = {
    critical: 'bg-status-critical',
    serious: 'bg-status-serious',
    warning: 'bg-status-warning',
    good: 'bg-status-good',
    info: 'bg-status-info',
    neutral: 'bg-status-neutral',
  };
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', color[tone], className)} />;
}
