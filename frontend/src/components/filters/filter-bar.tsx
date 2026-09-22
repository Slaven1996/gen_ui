import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** One row of filters above a table or chart; wraps on narrow screens. */
export function FilterBar({
  children,
  onReset,
  canReset,
}: {
  children: ReactNode;
  /** Shown when `canReset` — clears every filter back to the page defaults. */
  onReset?: () => void;
  canReset?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      {children}
      {onReset && canReset && (
        <Button variant="ghost" onClick={onReset}>
          Reset
          <X />
        </Button>
      )}
    </div>
  );
}
