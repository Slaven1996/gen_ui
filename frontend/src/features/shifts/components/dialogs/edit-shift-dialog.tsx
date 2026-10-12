import type { ShiftAssignment } from '@gen-ui/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EditShiftForm } from './edit-shift-form';

/** Change one shift — or the person, role or notes of the rest of its series. */
export function EditShiftDialog({
  shift,
  timeZone,
  onOpenChange,
}: {
  shift: ShiftAssignment | null;
  timeZone: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={shift !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {shift && timeZone && <EditShiftForm shift={shift} timeZone={timeZone} onSaved={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
