import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FilterOption } from './multi-select-filter';

const ALL = '__all__';

/** A single-value filter; the "all" entry maps to `undefined`, which drops the param. */
export function SelectFilter<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  /** Omit to make a value required (no "all" entry). */
  allLabel?: string;
  options: readonly FilterOption<T>[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  className?: string;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : (next as T))}
    >
      <SelectTrigger className={cn('w-44', className)} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.icon}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
