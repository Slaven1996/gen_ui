import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { AlarmDefinition } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';
import { useDeleteAlarmDefinition, useSaveAlarmDefinition } from '../api/mutations';
import { DefinitionFormDialog } from '../components/definition-form-dialog';
import type { DefinitionActions } from '../types';

/**
 * Row actions for admins, wherever the table is shown: the Alarm rules page
 * or an assistant answer. They bring their own edit and delete dialogs.
 * Everyone else gets a read-only table. The API enforces the same rule
 * (changing a rule is admin-only); this only decides what to show.
 */
export function useDefinitionActions(): { actions: DefinitionActions | undefined; dialogs: ReactNode } {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [editing, setEditing] = useState<AlarmDefinition | null>(null);
  const [deleting, setDeleting] = useState<AlarmDefinition | null>(null);
  const { mutate: save } = useSaveAlarmDefinition();
  const remove = useDeleteAlarmDefinition();

  const actions = useMemo<DefinitionActions | undefined>(
    () =>
      isAdmin
        ? {
            onEdit: setEditing,
            onDelete: setDeleting,
            onToggle: (definition, isEnabled) =>
              save({ id: definition.id, input: { isEnabled } }, { onError: (error) => toast.error(getErrorMessage(error)) }),
          }
        : undefined,
    [isAdmin, save],
  );

  const dialogs = actions && (
    <>
      <DefinitionFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        definition={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete alarm rule?"
        description={
          <>
            “{deleting?.name}” will stop being evaluated. Only rules that never fired can be deleted; disable the others to
            keep their history.
          </>
        }
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
}
