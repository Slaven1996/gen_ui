import type { Asset, AssetDetail } from '@gen-ui/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AssetForm } from './asset-form';

/** Create an asset (optionally under `parentId`) or edit one — changing the parent moves its subtree. */
export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
  parentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset;
  parentId?: string;
  onSaved?: (asset: AssetDetail) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Opening mounts the form afresh, with the values of the asset it opens on. */}
        <AssetForm
          asset={asset}
          parentId={parentId}
          onSaved={(saved) => {
            onOpenChange(false);
            onSaved?.(saved);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
