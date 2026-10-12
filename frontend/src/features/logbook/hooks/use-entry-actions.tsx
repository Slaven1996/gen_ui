import { useMemo, useState, type ReactNode } from 'react';
import type { LogbookEntry } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth/auth-store';
import { useDeleteLogbookEntry } from '../api/mutations';
import { EntryFormDialog } from '../components/entry-form-dialog';
import type { EntryActions } from '../types';

/**
 * Row actions wherever the table is shown: the Logbook page or an assistant
 * answer. Authors edit their own entries; authors and admins delete them;
 * system events stay as they are. They bring their own dialogs. The API
 * enforces the same rules; this only decides what to show.
 */
export function useEntryActions(): { actions: EntryActions; dialogs: ReactNode } {
  const { user } = useAuth();
  const [editing, setEditing] = useState<LogbookEntry | null>(null);
  const [deleting, setDeleting] = useState<LogbookEntry | null>(null);
  const remove = useDeleteLogbookEntry();

  const actions = useMemo<EntryActions>(
    () => ({
      canEdit: (entry) => entry.author?.id === user?.id,
      canDelete: (entry) => entry.author !== null && (entry.author.id === user?.id || user?.role === 'ADMIN'),
      onEdit: setEditing,
      onDelete: setDeleting,
    }),
    [user?.id, user?.role],
  );

  const dialogs = (
    <>
      <EntryFormDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} entry={editing ?? undefined} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this entry?"
        description={<>“{deleting?.title}” will be removed from the logbook. The audit trail keeps a record of the deletion.</>}
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
}
