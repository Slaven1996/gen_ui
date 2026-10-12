import { useMemo, useState, type ReactNode } from 'react';
import type { Asset } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth/auth-store';
import { useDeleteAsset } from '../api/mutations';
import { AssetFormDialog } from '../components/asset-form-dialog';
import type { AssetActions } from '../types';

/**
 * Row actions for admins, wherever the table is shown: the Assets page or an
 * assistant answer. They bring their own edit and delete dialogs. Everyone
 * else gets a read-only table. The API enforces the same rule; this only
 * decides what to show.
 */
export function useAssetActions(): { actions: AssetActions | undefined; dialogs: ReactNode } {
  const { user } = useAuth();
  const allowed = user?.role === 'ADMIN';
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const remove = useDeleteAsset();

  const actions = useMemo<AssetActions | undefined>(
    () => (allowed ? { onEdit: setEditing, onDelete: setDeleting } : undefined),
    [allowed],
  );

  const dialogs = actions && (
    <>
      <AssetFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        asset={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="The asset is removed from the tree, together with its alarm history. Only empty assets (no sub-assets or devices) can be deleted."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
}
