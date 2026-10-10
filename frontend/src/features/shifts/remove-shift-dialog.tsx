import { useState } from 'react';
import type { ShiftAssignment, ShiftScope } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatShortDate, shiftTimes } from './calendar-utils';
import { useDeleteAssignment } from './api';
import { ScopeChoice } from './scope-choice';

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
        {shift && timeZone && <RemoveShift shift={shift} timeZone={timeZone} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RemoveShift({ shift, timeZone, onDone }: { shift: ShiftAssignment; timeZone: string; onDone: () => void }) {
  const [scope, setScope] = useState<ShiftScope>('one');
  const remove = useDeleteAssignment();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Remove shift?</DialogTitle>
        <DialogDescription>
          {shift.user.name} · {shift.template.name}, {formatShortDate(shift.date)} {shiftTimes(shift, timeZone).label}
        </DialogDescription>
      </DialogHeader>
      {shift.seriesId && <ScopeChoice value={scope} onChange={setScope} />}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate({ id: shift.id, scope }, { onSuccess: onDone })}
        >
          {remove.isPending ? 'Removing…' : 'Remove'}
        </Button>
      </DialogFooter>
    </>
  );
}
