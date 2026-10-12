import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { NotificationList } from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { notificationKeys } from './queries';

/**
 * Optimistic: `change` rewrites the cached inbox before the request is sent,
 * a failure puts it back, and the inbox is refetched either way.
 */
function useInboxMutation<T>(
  send: (variables: T) => Promise<unknown>,
  change: (inbox: NotificationList, variables: T) => NotificationList,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: T) => {
      await send(variables);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.inbox });
      const previous = queryClient.getQueryData<NotificationList>(notificationKeys.inbox);
      if (previous) queryClient.setQueryData<NotificationList>(notificationKeys.inbox, change(previous, variables));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(notificationKeys.inbox, context.previous);
      toast.error(getErrorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/** Marks these ids read; `undefined` marks every unread one, shown or not. */
export function useMarkNotificationsRead() {
  return useInboxMutation<string[] | undefined>(
    (ids) => http.post('/notifications/read', ids ? { ids } : {}),
    (inbox, ids) => {
      const readAt = new Date().toISOString();
      const marks = (id: string) => !ids || ids.includes(id);
      const marked = inbox.items.filter((item) => item.readAt === null && marks(item.id)).length;
      return {
        ...inbox,
        items: inbox.items.map((item) => (item.readAt === null && marks(item.id) ? { ...item, readAt } : item)),
        unread: ids ? Math.max(0, inbox.unread - marked) : 0,
      };
    },
  );
}

export function useDeleteNotification() {
  return useInboxMutation<string>(
    (id) => http.delete(`/notifications/${id}`),
    (inbox, id) => {
      const gone = inbox.items.find((item) => item.id === id);
      if (!gone) return inbox;
      return {
        ...inbox,
        items: inbox.items.filter((item) => item !== gone),
        total: inbox.total - 1,
        unread: gone.readAt === null ? Math.max(0, inbox.unread - 1) : inbox.unread,
      };
    },
  );
}

export function useClearNotifications() {
  return useInboxMutation<void>(
    () => http.delete('/notifications'),
    (inbox) => ({ ...inbox, items: [], total: 0, unread: 0 }),
  );
}
