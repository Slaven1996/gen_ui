import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * A dialog drawn in place instead of over the page: `DialogContent`'s box and
 * its top-right X, without the portal, overlay or focus trap. The assistant
 * shows the app's own form dialogs inside a chat answer with it, so they look
 * and act the same there as on their page.
 *
 * The non-modal Radix root renders nothing itself. It gives `DialogTitle`,
 * `DialogDescription` and `DialogClose` the context they need, so the same
 * form markup works in both places. Its X calls `onClose`.
 */
export function InlineDialog({
  onClose,
  className,
  children,
}: {
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open modal={false} onOpenChange={(open) => !open && onClose()}>
      <div data-slot="inline-dialog" className={cn('relative grid w-full gap-4 rounded-lg border bg-background p-6', className)}>
        {children}
        <DialogClose className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogClose>
      </div>
    </Dialog>
  );
}
