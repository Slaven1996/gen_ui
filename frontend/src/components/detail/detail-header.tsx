import type { ReactNode } from 'react';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * A detail's title block: the record's name, one line about it, and its
 * badges. `action` (a chat card's "Open in new tab") sits beside the title;
 * without one, the title leaves room for the sheet's X.
 */
export function DetailHeader({
  title,
  description,
  badges,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  badges?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <SheetHeader>
      <div className="flex items-start justify-between gap-2">
        <SheetTitle className={action ? undefined : 'pr-6'}>{title}</SheetTitle>
        {action && <div className="-my-1 shrink-0">{action}</div>}
      </div>
      <SheetDescription>{description}</SheetDescription>
      {badges && <div className="flex flex-wrap gap-2 pt-1">{badges}</div>}
    </SheetHeader>
  );
}
