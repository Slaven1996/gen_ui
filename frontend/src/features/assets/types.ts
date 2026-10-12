import type { Asset } from '@gen-ui/shared';

/** Admin row actions; without them the table is read-only. */
export interface AssetActions {
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
}
