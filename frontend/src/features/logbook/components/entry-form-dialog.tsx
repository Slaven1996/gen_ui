import type { LogbookEntry } from '@gen-ui/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EntryForm } from './entry-form';

/** Write a note, a maintenance record or a shift handover — or edit your own. */
export function EntryFormDialog({
  open,
  onOpenChange,
  entry,
  initialAssetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: LogbookEntry;
  initialAssetId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Opening mounts the form afresh, with the values of the entry it opens on (or the time now). */}
        <EntryForm entry={entry} initialAssetId={initialAssetId} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
