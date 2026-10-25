import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useMatchRoute, useSearch } from '@tanstack/react-router';
import { SquarePen } from 'lucide-react';
import type { ConversationSummary } from '@gen-ui/shared';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import { conversationsQueryOptions } from '../api/queries';
import { useChatActions } from '../hooks/use-chat-actions';
import { useLoadMore } from '../hooks/use-load-more';
import { ChatNavItem } from './chat-nav-item';

/**
 * The assistant in the app sidebar: "New chat", then the user's chats, latest
 * activity first, in a list that scrolls on its own and loads more near its
 * end. It fills the rest of the sidebar; collapsed to icons, only "New chat"
 * is left.
 */
export function ChatNav() {
  const matchRoute = useMatchRoute();
  const { chat: chatParam } = useSearch({ strict: false });
  const openId = matchRoute({ to: '/assistant' }) ? chatParam : undefined;
  const onNewChat = Boolean(matchRoute({ to: '/assistant' })) && !chatParam;

  const list = useInfiniteQuery(conversationsQueryOptions());
  const { actions, dialogs } = useChatActions(openId);
  const { rootRef, sentinelRef } = useLoadMore<HTMLDivElement, HTMLDivElement>(
    list.fetchNextPage,
    list.hasNextPage && !list.isFetchingNextPage,
  );
  const chats = useMemo(() => uniqueById(list.data?.pages.flatMap((page) => page.items) ?? []), [list.data]);

  return (
    <SidebarGroup className="min-h-40 flex-1">
      <SidebarGroupLabel>Assistant</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="New chat" isActive={onNewChat}>
            <Link to="/assistant" search={{}}>
              <SquarePen />
              <span>New chat</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <SidebarGroupContent
        ref={rootRef}
        className="mt-1 min-h-0 flex-1 overflow-y-auto group-data-[collapsible=icon]:hidden"
      >
        {list.isPending ? (
          <div aria-hidden>
            <SidebarMenuSkeleton />
            <SidebarMenuSkeleton />
            <SidebarMenuSkeleton />
          </div>
        ) : list.isError ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Couldn't load your chats.{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => void list.refetch()}>
              Retry
            </button>
          </p>
        ) : chats.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet.</p>
        ) : (
          <SidebarMenu>
            {chats.map((chat) => (
              <ChatNavItem key={chat.id} chat={chat} active={chat.id === openId} actions={actions} />
            ))}
          </SidebarMenu>
        )}
        <div ref={sentinelRef} aria-hidden className="h-px" />
        {list.isFetchingNextPage && <SidebarMenuSkeleton />}
      </SidebarGroupContent>
      {dialogs}
    </SidebarGroup>
  );
}

/** A chat can move up between two pages being read (offset paging); keep its first place. */
function uniqueById(items: ConversationSummary[]): ConversationSummary[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}
