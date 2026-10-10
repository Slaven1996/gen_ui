import { useState, type FormEvent } from 'react';
import { CopyShiftWeekSchema } from '@gen-ui/shared';
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
import { getErrorMessage } from '@/lib/api/errors';
import { useCopyWeek } from './api';
import { formatDateRange } from './calendar-utils';

const WEEK_COUNTS = [1, 2, 3, 4, 6, 8];

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

function CopyWeekForm({
  week,
  filters,
  onSaved,
}: {
  week: { from: string; to: string };
  filters: { userId?: string[]; templateId?: string[] };
  onSaved: () => void;
}) {
  const [weeks, setWeeks] = useState('1');
  const copy = useCopyWeek();
  const filtered = Boolean(filters.userId || filters.templateId);

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
      <Field id="copy-weeks" label="Into">
        <Select value={weeks} onValueChange={setWeeks}>
          <SelectTrigger id="copy-weeks" className="w-full">
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
      {filtered && (
        <p className="text-sm text-muted-foreground">Only the shifts of the people and shifts filtered on the page are copied.</p>
      )}
      {copy.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(copy.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={copy.isPending}>
          {copy.isPending ? 'Copying…' : 'Copy'}
        </Button>
      </DialogFooter>
    </form>
  );
}
