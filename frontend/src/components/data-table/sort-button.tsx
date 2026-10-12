import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServerSort } from './data-table';

export function SortButton({
  sortKey,
  first,
  sort,
  children,
}: {
  sortKey: string;
  first: 'asc' | 'desc';
  sort: ServerSort;
  children: React.ReactNode;
}) {
  const active = sort.value === sortKey || sort.value === `-${sortKey}`;
  const descending = sort.value === `-${sortKey}`;
  const next = active ? (descending ? sortKey : `-${sortKey}`) : first === 'desc' ? `-${sortKey}` : sortKey;
  const Icon = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp;

  return (
    <button
      type="button"
      onClick={() => sort.onChange(next)}
      className="-ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent"
      aria-label={`Sort by ${typeof children === 'string' ? children : sortKey}`}
    >
      {children}
      <Icon className={cn('size-3.5', !active && 'opacity-40')} />
      {active && <span className="sr-only">{descending ? '(descending)' : '(ascending)'}</span>}
    </button>
  );
}
