import { useMemo, useState, type ReactNode } from 'react';
import type { Device } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth/auth-store';
import { useDeleteDevice } from '../api/mutations';
import { DeviceFormDialog } from '../components/device-form-dialog';
import type { DeviceActions } from '../types';

/**
 * Row actions for admins, wherever the full table is shown: the Devices page
 * or an assistant answer. They bring their own edit and delete dialogs.
 * Everyone else, and compact embeds (an asset's page), get a read-only
 * table. The API enforces the same rule; this only decides what to show.
 */
export function useDeviceActions(enabled: boolean): { actions: DeviceActions | undefined; dialogs: ReactNode } {
  const { user } = useAuth();
  const allowed = enabled && user?.role === 'ADMIN';
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const remove = useDeleteDevice();

  const actions = useMemo<DeviceActions | undefined>(
    () => (allowed ? { onEdit: setEditing, onDelete: setDeleting } : undefined),
    [allowed],
  );

  const dialogs = actions && (
    <>
      <DeviceFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        device={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Only devices without tags can be deleted."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
}
