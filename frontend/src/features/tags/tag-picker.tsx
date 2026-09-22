import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Tag } from '@gen-ui/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { tagsListQueryOptions } from '@/features/assets/api';
import { formatReading } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Search tags by name, code or unit and pick one (`max={1}`) or several.
 * Selected tags are fetched by id, so the trigger can name them even when
 * they are not in the current search results.
 */
export function TagPicker({
  value,
  onChange,
  max = 8,
  placeholder = 'Choose tags',
  id,
  className,
  disabled,
}: {
  value: readonly string[];
  onChange: (ids: string[]) => void;
  max?: number;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const single = max === 1;

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(draft.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const selectedTags = useQuery({
    ...tagsListQueryOptions({ ids: [...value], pageSize: 100 }),
    enabled: value.length > 0,
  });
  const results = useQuery({ ...tagsListQueryOptions({ search: search || undefined, pageSize: 25 }), enabled: open });

  const byId = new Map((selectedTags.data?.items ?? []).map((tag) => [tag.id, tag]));
  const chosen = value.map((tagId) => byId.get(tagId)).filter((tag): tag is Tag => Boolean(tag));

  const toggle = (tag: Tag) => {
    if (single) {
      onChange([tag.id]);
      setOpen(false);
      return;
    }
    if (value.includes(tag.id)) onChange(value.filter((tagId) => tagId !== tag.id));
    else if (value.length < max) onChange([...value, tag.id]);
  };

  const label =
    chosen.length === 0
      ? placeholder
      : single
        ? `${chosen[0].name} · ${chosen[0].asset.name}`
        : chosen.length === 1
          ? chosen[0].name
          : `${chosen.length} tags`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn('justify-between font-normal', chosen.length === 0 && 'text-muted-foreground', className)}
          disabled={disabled}
          aria-label={placeholder}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <div className="relative border-b">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search name, code or unit"
            className="h-10 rounded-none border-0 pl-9 shadow-none focus-visible:ring-0"
            aria-label="Search tags"
            autoFocus
          />
        </div>
        {!single && chosen.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b p-2">
            {chosen.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
                {tag.name}
                <button
                  type="button"
                  className="rounded-sm hover:bg-background"
                  onClick={() => toggle(tag)}
                  aria-label={`Remove ${tag.name}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <ul className="max-h-72 overflow-y-auto p-1" role="listbox" aria-multiselectable={!single}>
          {results.isPending && <li className="p-3 text-sm text-muted-foreground">Searching…</li>}
          {results.data?.items.length === 0 && <li className="p-3 text-sm text-muted-foreground">No tags found.</li>}
          {results.data?.items.map((tag) => {
            const isSelected = value.includes(tag.id);
            const full = !isSelected && !single && value.length >= max;
            return (
              <li key={tag.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => toggle(tag)}
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <Check className={cn('mt-0.5 size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{tag.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {tag.asset.name} · {tag.code}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatReading(tag.lastValue, tag.unit)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {!single && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {value.length} of {max} selected
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
