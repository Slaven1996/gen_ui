import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'critical' | 'serious' | 'warning' | 'good' | 'info' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  critical: 'border-status-critical/40 bg-status-critical/10 [&>svg]:text-status-critical',
  serious: 'border-status-serious/50 bg-status-serious/10 [&>svg]:text-status-serious',
  warning: 'border-status-warning/60 bg-status-warning/15 [&>svg]:text-status-warning',
  good: 'border-status-good/40 bg-status-good/10 [&>svg]:text-status-good',
  info: 'border-status-info/40 bg-status-info/10 [&>svg]:text-status-info',
  neutral: 'border-border bg-muted [&>svg]:text-muted-foreground',
};

/**
 * A state shown as colour + icon + text, never colour alone. The text stays
 * in the normal ink colour; only the icon and tint carry the tone.
 */
export function StatusBadge({
  tone,
  icon: Icon,
  label,
  className,
}: {
  tone: StatusTone;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground [&>svg]:size-3.5',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden />}
      {label}
    </span>
  );
}
