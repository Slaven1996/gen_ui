import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { ConversationSummary } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDeleteConversation } from '../api/mutations';
import { RenameChatDialog } from '../components/rename-chat-dialog';
import type { ChatActions } from '../types';

/**
 * Rename and delete, for the chats in the sidebar and the chat on screen.
 * They bring their own dialogs. Deleting the chat on screen (`openId`) moves
 * to a new chat.
 */
export function useChatActions(openId: string | undefined): { actions: ChatActions; dialogs: ReactNode } {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const remove = useDeleteConversation();

  const actions = useMemo<ChatActions>(() => ({ onRename: setRenaming, onDelete: setDeleting }), []);

  const confirmDelete = () => {
    if (!deleting) return;
    const id = deleting;
    remove.mutate(id, {
      onSuccess: () => {
        if (id === openId) void navigate({ to: '/assistant', search: {}, replace: true });
      },
      onSettled: () => setDeleting(null),
    });
  };

  const dialogs = (
    <>
      <RenameChatDialog
        key={renaming?.id}
        chat={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this chat?"
        description="It is deleted for good, on every device. Dashboards saved from it stay."
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );

  return { actions, dialogs };
}
