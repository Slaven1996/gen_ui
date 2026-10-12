import type { Tag } from '@gen-ui/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TagForm } from './tag-form';

/** Create a tag on a device, or edit one. A tag cannot move to another device. */
export function TagFormDialog({
  open,
  onOpenChange,
  tag,
  deviceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: Tag;
  deviceId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Opening mounts the form afresh, with the values of the tag it opens on. */}
        <TagForm tag={tag} deviceId={deviceId} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
