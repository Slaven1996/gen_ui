import type { ShiftAssignment } from '@gen-ui/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RemoveShiftForm } from './remove-shift-form';

/** "Remove this shift?" — and for a series, which of its shifts. */
export function RemoveShiftDialog({
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
      <DialogContent className="sm:max-w-md">
        {shift && timeZone && (
          <RemoveShiftForm
            shift={shift}
            timeZone={timeZone}
            onRemoved={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
