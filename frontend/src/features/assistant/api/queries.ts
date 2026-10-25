import { infiniteQueryOptions } from '@tanstack/react-query';
import type { ConversationList, ListConversationsQueryInput } from '@gen-ui/shared';
import { http } from '@/lib/api/http';

/*
 * The signed-in user's chats, for the list in the sidebar. A chat's messages
 * are not here: the chat store loads them into the chat itself
 * (store/chat-store.ts), since `useChat` owns them from then on.
 */

export const conversationKeys = {
  all: ['conversations'] as const,
  list: ['conversations', 'list'] as const,
};

const PAGE_SIZE = 30;

/** Latest activity first, a page at a time as the list scrolls. */
export const conversationsQueryOptions = () =>
  infiniteQueryOptions({
    queryKey: conversationKeys.list,
    queryFn: async ({ pageParam }) => {
      const params: ListConversationsQueryInput = { page: pageParam, pageSize: PAGE_SIZE };
      return (await http.get<ConversationList>('/ai/conversations', { params })).data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
