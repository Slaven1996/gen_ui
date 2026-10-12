import { useState } from 'react';
import type { LastSignInFilter as LastSignIn } from '@gen-ui/shared';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Mode = 'all' | 'never' | 'date';

/** Today in the browser's zone, as YYYY-MM-DD — what `<input type="date">` speaks. */
function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Last sign-in in three states: All (no filter), Never signed in, or an exact
 * date picked in the date field that appears next to the dropdown. The value
 * is the `lastSignIn` URL/API param itself: `undefined`, `never` or a date.
 *
 * "Exact date" opens an empty date field and filters nothing until a date is
 * picked. That in-between state isn't a param value, so it lives here; the
 * page remounts this component (`key`) when it resets its filters.
 */
export function LastSignInFilter({
  value,
  onChange,
}: {
  value: LastSignIn | undefined;
  onChange: (value: LastSignIn | undefined) => void;
}) {
  const [choosingDate, setChoosingDate] = useState(false);
  const date = value && value !== 'never' ? value : undefined;
  const mode: Mode = value === 'never' ? 'never' : date || choosingDate ? 'date' : 'all';

  const pickMode = (next: Mode) => {
    setChoosingDate(next === 'date');
    if (next === 'all') onChange(undefined);
    else if (next === 'never') onChange('never');
    // "Exact date" drops a `never` filter; the date field starts empty.
    else if (value === 'never') onChange(undefined);
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={mode} onValueChange={(next) => pickMode(next as Mode)}>
        <SelectTrigger className="w-auto" aria-label="Last sign-in">
          <span className="text-muted-foreground">Last sign-in:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="never">Never signed in</SelectItem>
          <SelectItem value="date">Exact date</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'date' && (
        <Input
          type="date"
          className="w-40"
          aria-label="Last sign-in date"
          value={date ?? ''}
          max={today()}
          // Clearing the date drops the filter but keeps the field open for another date.
          onChange={(event) => {
            setChoosingDate(true);
            onChange(event.target.value || undefined);
          }}
        />
      )}
    </div>
  );
}
