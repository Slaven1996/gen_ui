import { MoreHorizontal } from 'lucide-react';
import type { PublicUser } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { UserActions } from '../types';

/** The row menu on a user: role and activation changes, never on yourself. */
export function UserRowActions({ user, actions: { currentUserId, onUpdate } }: { user: PublicUser; actions: UserActions }) {
  const isSelf = user.id === currentUserId;
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${user.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.role === 'USER' ? (
            <DropdownMenuItem onSelect={() => onUpdate(user, { role: 'ADMIN' })}>Make admin</DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={isSelf} onSelect={() => onUpdate(user, { role: 'USER' })}>
              Remove admin role
            </DropdownMenuItem>
          )}
          {user.isActive ? (
            <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => onUpdate(user, { isActive: false })}>
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onUpdate(user, { isActive: true })}>Reactivate</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
