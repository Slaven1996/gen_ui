import { useQuery } from '@tanstack/react-query';
import { shiftAssignmentQueryOptions, shiftTemplatesQueryOptions } from '@/features/shifts/api/queries';
import { EditShiftForm } from '@/features/shifts/components/dialogs/edit-shift-form';
import type { FormProps } from '../../types';
import { WhenLoaded } from '../when-loaded';

/**
 * The shift as it is now, with Claude's changes over it. It waits for the
 * templates too, so a change to another shift brings that shift's hours.
 */
export function EditShiftBody({ input, output, disabled, onSaved }: FormProps<'editShift'>) {
  const shift = useQuery(shiftAssignmentQueryOptions(output.shiftId));
  const templates = useQuery(shiftTemplatesQueryOptions());
  return (
    <WhenLoaded query={shift}>
      {(current) => (
        <WhenLoaded query={templates}>
          {() => (
            <EditShiftForm
              shift={current}
              timeZone={output.timeZone}
              prefill={input.changes}
              initialScope={output.scope}
              disabled={disabled}
              // A change to the rest of a series may leave this shift (already started) as it was.
              onSaved={({ items }) => onSaved(output.shiftId, items.map((item) => item.id))}
            />
          )}
        </WhenLoaded>
      )}
    </WhenLoaded>
  );
}
