import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * A detail drawn in place, as a card in a chat answer: the box `DetailSheet`
 * gives it, without the overlay, the slide-in or the X. Like `InlineDialog`,
 * the non-modal Radix root renders nothing itself; it gives the detail's
 * `SheetTitle` and `SheetDescription` the context they need, so the same
 * component works in both places. The detail brings its own padding.
 */
export function DetailCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Dialog open modal={false}>
      <div data-slot="detail-card" className={cn('flex flex-col gap-4 rounded-lg border bg-background', className)}>
        {children}
      </div>
    </Dialog>
  );
}
