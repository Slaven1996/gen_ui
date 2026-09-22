import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * A multi-value filter. `undefined` means "no filter" (all values), which is
 * also what an empty selection collapses to — the URL then drops the param.
 */
export function MultiSelectFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly FilterOption<T>[];
  value: readonly T[] | undefined;
  onChange: (value: T[] | undefined) => void;
}) {
  const selected = new Set(value ?? []);

  const toggle = (option: T, checked: boolean) => {
    const next = options.map((item) => item.value).filter((item) => (item === option ? checked : selected.has(item)));
    onChange(next.length > 0 ? next : undefined);
  };

  const summary =
    selected.size === 0
      ? null
      : selected.size === 1
        ? options.find((option) => selected.has(option.value))?.label
        : `${selected.size} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="border-dashed data-[active=true]:border-solid" data-active={selected.size > 0}>
          {label}
          {summary && (
            <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
              {summary}
            </Badge>
          )}
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.has(option.value)}
            onCheckedChange={(checked) => toggle(option.value, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {option.icon}
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(undefined)}>Clear</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
