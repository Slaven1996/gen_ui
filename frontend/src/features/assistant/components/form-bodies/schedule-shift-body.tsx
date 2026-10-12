import { zonedDate } from '@gen-ui/shared';
import { ScheduleShiftForm } from '@/features/shifts/components/dialogs/schedule-shift-form';
import { reportShifts } from '../../lib/form-changes';
import type { FormProps } from '../../types';

/** Dates and times are the plant's, as on the Shifts page: `output.timeZone`. */
export function ScheduleShiftBody({ input, output, disabled, onSaved }: FormProps<'scheduleShift'>) {
  return (
    <ScheduleShiftForm
      prefill={input}
      date={zonedDate(new Date(), output.timeZone)}
      timeZone={output.timeZone}
      disabled={disabled}
      onSaved={reportShifts(onSaved)}
    />
  );
}
