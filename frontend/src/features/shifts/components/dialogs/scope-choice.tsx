import { useId } from 'react';
import { SHIFT_SCOPES, type ShiftScope } from '@gen-ui/shared';
import { SHIFT_SCOPE } from '@/lib/labels';

/** For a shift that belongs to a series: change just it, it and the later ones, or all of them. */
export function ScopeChoice({ value, onChange }: { value: ShiftScope; onChange: (scope: ShiftScope) => void }) {
  const name = useId();
  return (
    <fieldset className="space-y-1.5 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Apply to</legend>
      {SHIFT_SCOPES.map((scope) => (
        <label key={scope} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={name}
            value={scope}
            checked={value === scope}
            onChange={() => onChange(scope)}
            className="size-4 accent-primary"
          />
          {SHIFT_SCOPE[scope]}
        </label>
      ))}
      <p className="text-xs text-muted-foreground">Shifts of the series that already started stay as they are.</p>
    </fieldset>
  );
}
