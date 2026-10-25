import { Link } from '@tanstack/react-router';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { ConversationSummary } from '@gen-ui/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { ChatActions } from '../types';

/** One chat in the sidebar: opens it, with rename and delete in its menu. */
export function ChatNavItem({
  chat,
  active,
  actions,
}: {
  chat: ConversationSummary;
  active: boolean;
  actions: ChatActions;
}) {
  const title = chat.title || 'Untitled chat';
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} title={title}>
        <Link to="/assistant" search={{ chat: chat.id }}>
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover aria-label={`Actions for ${title}`}>
            <MoreHorizontal />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onSelect={() => actions.onRename(chat)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(chat.id)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
