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
 * date picked in the date field that appears next to the dropdown. Switching
 * to "Exact date" starts on today, so the filter is never half set. The value
 * is the `lastSignIn` URL/API param itself: `undefined`, `never` or a date.
 */
export function LastSignInFilter({
  value,
  onChange,
}: {
  value: LastSignIn | undefined;
  onChange: (value: LastSignIn | undefined) => void;
}) {
  const date = value && value !== 'never' ? value : undefined;
  const mode: Mode = value === undefined ? 'all' : date ? 'date' : 'never';

  const pickMode = (next: Mode) => onChange(next === 'all' ? undefined : next === 'never' ? 'never' : today());

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
      {date && (
        <Input
          type="date"
          className="w-40"
          aria-label="Last sign-in date"
          value={date}
          max={today()}
          // Clearing the date field clears the filter.
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      )}
    </div>
  );
}
