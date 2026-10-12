import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';

/**
 * A record's details in a side sheet, open while `id` is set; closing calls
 * `onClose`. The body is a detail component that renders the same way in a
 * chat card (`DetailCard`). The last record stays on screen while the sheet
 * slides out.
 */
export function DetailSheet({
  id,
  onClose,
  children,
}: {
  id: string | undefined;
  onClose: () => void;
  children: (id: string) => ReactNode;
}) {
  const [shown, setShown] = useState(id);
  if (id && id !== shown) setShown(id);

  return (
    <Sheet open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{shown && children(shown)}</SheetContent>
    </Sheet>
  );
}
