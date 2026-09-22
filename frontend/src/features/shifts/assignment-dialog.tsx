import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SHIFT_ROLES, type ShiftAssignment, type ShiftRole } from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { userOptionsQueryOptions } from '@/features/users/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { formatDateTime, formatTime } from '@/lib/format';
import { SHIFT_ROLE } from '@/lib/labels';
import { useDeleteAssignment, useUpdateAssignment } from './api';

/** Swap the person, change the role or notes, or remove the shift. */
export function AssignmentDialog({
  assignment,
  onOpenChange,
}: {
  assignment: ShiftAssignment | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<ShiftRole>('OPERATOR');
  const [notes, setNotes] = useState('');
  const users = useQuery({ ...userOptionsQueryOptions(), enabled: Boolean(assignment) });
  const update = useUpdateAssignment();
  const remove = useDeleteAssignment();

  useEffect(() => {
    if (assignment) {
      setUserId(assignment.user.id);
      setRole(assignment.role);
      setNotes(assignment.notes ?? '');
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when another shift opens.
  }, [assignment?.id]);

  if (!assignment) return null;

  const save = () =>
    update.mutate(
      {
        id: assignment.id,
        patch: {
          ...(userId !== assignment.user.id && { userId }),
          ...(role !== assignment.role && { role }),
          ...(notes !== (assignment.notes ?? '') && { notes: notes.trim() || null }),
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );

  const changed = userId !== assignment.user.id || role !== assignment.role || notes !== (assignment.notes ?? '');

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{assignment.template.name} shift</DialogTitle>
          <DialogDescription>
            {formatDateTime(assignment.startsAt)} – {formatTime(assignment.endsAt)}
          </DialogDescription>
        </DialogHeader>
        <Field id="assignment-user" label="Person">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger id="assignment-user" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {users.data?.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="assignment-role" label="Role">
          <Select value={role} onValueChange={(value) => setRole(value as ShiftRole)}>
            <SelectTrigger id="assignment-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHIFT_ROLES.map((value) => (
                <SelectItem key={value} value={value}>
                  {SHIFT_ROLE[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="assignment-notes" label="Notes">
          <Textarea id="assignment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {update.isError && (
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(update.error)}
          </p>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(assignment.id, { onSuccess: () => onOpenChange(false) })}
          >
            Remove shift
          </Button>
          <Button onClick={save} disabled={!changed || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
