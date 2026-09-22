import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Debounced so typing doesn't fire a request per keystroke. */
export function SearchFilter({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
}) {
  const current = value ?? '';
  const [draft, setDraft] = useState(current);

  useEffect(() => setDraft(current), [current]);

  useEffect(() => {
    if (draft.trim() === current) return;
    const timer = window.setTimeout(() => onChange(draft.trim() || undefined), 300);
    return () => window.clearTimeout(timer);
  }, [draft, current, onChange]);

  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-8"
      />
    </div>
  );
}
