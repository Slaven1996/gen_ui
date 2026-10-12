import { CircleAlert, UserPlus } from 'lucide-react';
import type { ShiftCoverage } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { shortfallLabel } from '../../lib/calendar-utils';

/** An unmet staffing target; for admins, a button that schedules someone into it. */
export function CoverageSlot({
  shortfall,
  templateName,
  onSchedule,
}: {
  shortfall: ShiftCoverage;
  /** Shown where the row doesn't already say which shift it is. */
  templateName?: string;
  onSchedule?: () => void;
}) {
  const label = `${templateName ? `${templateName}: ` : ''}${shortfallLabel(shortfall)}`;
  const className =
    'flex w-full items-center gap-1.5 rounded-md border border-dashed border-destructive/50 px-1.5 py-1 text-left text-xs text-destructive';
  if (!onSchedule) {
    return (
      <div className={className}>
        <CircleAlert className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn(className, 'hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}
      onClick={onSchedule}
      title="Schedule someone"
    >
      <UserPlus className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
