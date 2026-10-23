import { useQuery } from '@tanstack/react-query';
import type { ShiftAssignment } from '@gen-ui/shared';
import { shiftAssignmentQueryOptions } from '@/features/shifts/api/queries';
import { RemoveShiftForm } from '@/features/shifts/components/dialogs/remove-shift-form';
import type { FormProps } from '../../types';
import { WhenLoaded } from '../when-loaded';

/**
 * The calendar's remove confirmation for the shift as it is now, with the
 * scope Claude picked. What went is read back from the database, so the save
 * reports only the shift the form opened on.
 */
export function RemoveShiftBody({ output, disabled, onSaved }: FormProps<'removeShift'>) {
  const shift = useQuery(shiftAssignmentQueryOptions(output.shiftId));
  const form = (current: ShiftAssignment) => (
    <RemoveShiftForm
      shift={current}
      timeZone={output.timeZone}
      initialScope={output.scope}
      disabled={disabled}
      onRemoved={() => onSaved(output.shiftId)}
    />
  );
  // Removing the shift makes its refetch fail: the form stays on the copy it loaded until it has
  // reported the removal (an unmounted form's `mutate` callbacks never run).
  return shift.data ? form(shift.data) : <WhenLoaded query={shift}>{form}</WhenLoaded>;
}
