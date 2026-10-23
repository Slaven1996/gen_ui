import { useState } from 'react';
import type { ShiftAssignment, ShiftRemoveResult, ShiftScope } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDeleteAssignment } from '../../api/mutations';
import { formatShortDate, shiftTimes } from '../../lib/calendar-utils';
import { ScopeChoice } from './scope-choice';

/**
 * The dialog body: which occurrences to remove, and the button. The calendar
 * shows it in `RemoveShiftDialog`; the assistant shows it inside an answer
 * (`InlineDialog`, which has its own close, so no `onCancel`) with the scope
 * Claude picked. Either way it sits inside a `Dialog`.
 */
export function RemoveShiftForm({
  shift,
  timeZone,
  initialScope = 'one',
  disabled = false,
  onRemoved,
  onCancel,
}: {
  shift: ShiftAssignment;
  timeZone: string;
  initialScope?: ShiftScope;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onRemoved: (result: ShiftRemoveResult) => void;
  /** Shows a Cancel button. */
  onCancel?: () => void;
}) {
  const [scope, setScope] = useState<ShiftScope>(shift.seriesId ? initialScope : 'one');
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
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="destructive"
          disabled={disabled || remove.isPending}
          onClick={() => remove.mutate({ id: shift.id, scope }, { onSuccess: onRemoved })}
        >
          {remove.isPending ? 'Removing…' : 'Remove'}
        </Button>
      </DialogFooter>
    </>
  );
}
