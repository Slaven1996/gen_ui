import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CopyShiftWeekSchema, type ShiftChangeResult } from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { userOptionsQueryOptions } from '@/features/users/api/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { useCopyWeek } from '../../api/mutations';
import { shiftTemplatesQueryOptions } from '../../api/queries';
import { formatDateRange } from '../../lib/calendar-utils';

/** Every count `CopyShiftWeekSchema` allows, so any count the assistant fills in is a choice. */
const WEEK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * The copy form: the dialog's header, the number of weeks and the button.
 * The calendar shows it in `CopyWeekDialog` for the week on screen; the
 * assistant shows it inside an answer (`InlineDialog`) for the week the user
 * named, with `weeks` filled in. Either way it sits inside a `Dialog`.
 */
export function CopyWeekForm({
  week,
  filters,
  weeks: initialWeeks = 1,
  disabled = false,
  onSaved,
}: {
  week: { from: string; to: string };
  /** Only these people's or shifts' shifts are copied. */
  filters: { userId?: string[]; templateId?: string[] };
  /** How many weeks the form starts on. */
  weeks?: number;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onSaved: (result: ShiftChangeResult) => void;
}) {
  const id = useId();
  const [weeks, setWeeks] = useState(String(initialWeeks));
  const copy = useCopyWeek();
  const users = useQuery(userOptionsQueryOptions());
  const templates = useQuery(shiftTemplatesQueryOptions());

  // "of Ava Mitchell, Noah Bennett on Night": the filters, by name.
  const people = filters.userId?.map((userId) => users.data?.find((user) => user.id === userId)?.name ?? 'someone');
  const shifts = filters.templateId?.map((templateId) => templates.data?.find((item) => item.id === templateId)?.name ?? 'a shift');
  const only = [people && `of ${people.join(', ')}`, shifts && `on ${shifts.join(', ')}`].filter(Boolean).join(' ');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const input = CopyShiftWeekSchema.parse({ week: week.from, weeks: Number(weeks), ...filters });
    copy.mutate(input, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Copy {formatDateRange(week.from, week.to)}</DialogTitle>
        <DialogDescription>
          Repeats this week’s shifts in the weeks after it, at the same times. If any copy would overlap a shift already
          planned, nothing is copied.
        </DialogDescription>
      </DialogHeader>
      <Field id={`${id}-weeks`} label="Into">
        <Select value={weeks} onValueChange={setWeeks}>
          <SelectTrigger id={`${id}-weeks`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEEK_COUNTS.map((count) => (
              <SelectItem key={count} value={String(count)}>
                {count === 1 ? 'The next week' : `The next ${count} weeks`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {only && <p className="text-sm text-muted-foreground">Only the shifts {only} are copied.</p>}
      {copy.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(copy.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled || copy.isPending}>
          {copy.isPending ? 'Copying…' : 'Copy'}
        </Button>
      </DialogFooter>
    </form>
  );
}
