import { queryOptions } from '@tanstack/react-query';
import type { NotificationList } from '@gen-ui/shared';
import { http } from '@/lib/api/http';

export const notificationKeys = {
  all: ['notifications'] as const,
  inbox: ['notifications', 'inbox'] as const,
};

/** The bell shows this many, newest first. */
export const INBOX_SIZE = 50;

/**
 * The signed-in user's inbox, for the bell. It never polls: the socket adds
 * each new notification to this cache entry, and every (re)connect refetches.
 */
export const notificationsQueryOptions = () =>
  queryOptions({
    queryKey: notificationKeys.inbox,
    queryFn: async () => (await http.get<NotificationList>('/notifications', { params: { pageSize: INBOX_SIZE } })).data,
  });
