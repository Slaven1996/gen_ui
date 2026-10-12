import { CopyWeekForm } from '@/features/shifts/components/dialogs/copy-week-form';
import { reportShifts } from '../../lib/form-changes';
import type { FormProps } from '../../types';

export function CopyShiftWeekBody({ input, output, disabled, onSaved }: FormProps<'copyShiftWeek'>) {
  return (
    <CopyWeekForm
      week={output.week}
      filters={{ userId: input.userId, templateId: input.templateId }}
      weeks={input.weeks}
      disabled={disabled}
      onSaved={reportShifts(onSaved)}
    />
  );
}
