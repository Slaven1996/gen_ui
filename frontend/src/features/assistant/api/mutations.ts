import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ConversationSummary, RenameConversationDto } from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { deleteChat } from '../store/chat-store';
import { conversationKeys } from './queries';

/** Gives a chat a title of the user's own; it keeps its place in the list. */
export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string } & RenameConversationDto) =>
      (await http.patch<ConversationSummary>(`/ai/conversations/${id}`, { title })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationKeys.list }),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

/** Deletes a chat for good, stopping its answer first. The store refreshes the list. */
export function useDeleteConversation() {
  return useMutation({
    mutationFn: (id: string) => deleteChat(id),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
