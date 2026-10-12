import { zonedDate } from '@gen-ui/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { browserTimeZone } from '@/lib/search';
import type { SchedulePrefill } from '../../types';
import { ScheduleShiftForm } from './schedule-shift-form';

/** Put someone on a shift for a day, or on chosen weekdays until a date. */
export function ScheduleShiftDialog({
  open,
  onOpenChange,
  prefill,
  defaultDate,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: SchedulePrefill;
  /** When `prefill` has no date; today otherwise. */
  defaultDate?: string;
  /** The plant time zone, to say which zone the times are in. */
  timeZone?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Opening mounts the form afresh with the prefill. */}
        <ScheduleShiftForm
          prefill={prefill}
          date={prefill?.date ?? defaultDate ?? zonedDate(new Date(), timeZone ?? browserTimeZone)}
          timeZone={timeZone}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
