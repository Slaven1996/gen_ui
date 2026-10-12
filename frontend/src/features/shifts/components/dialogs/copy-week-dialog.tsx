import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CopyWeekForm } from './copy-week-form';

/**
 * "Repeat this week": the shifts starting in the week shown, copied into the
 * weeks after it at the same local times. All or nothing — a copy that would
 * overlap a shift already planned stops the whole copy, and says which.
 */
export function CopyWeekDialog({
  open,
  onOpenChange,
  week,
  filters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Monday and Sunday of the week to copy. */
  week: { from: string; to: string };
  /** The People and Shift filters on the page; only their shifts are copied. */
  filters: { userId?: string[]; templateId?: string[] };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <CopyWeekForm week={week} filters={filters} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
