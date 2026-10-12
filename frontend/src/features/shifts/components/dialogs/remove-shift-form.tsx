import { useState } from 'react';
import type { ShiftAssignment, ShiftScope } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDeleteAssignment } from '../../api/mutations';
import { formatShortDate, shiftTimes } from '../../lib/calendar-utils';
import { ScopeChoice } from './scope-choice';

/** The dialog body: which occurrences to remove, and the button. */
export function RemoveShiftForm({ shift, timeZone, onDone }: { shift: ShiftAssignment; timeZone: string; onDone: () => void }) {
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
