import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import type { PublicUser, UpdateUserDto } from '@gen-ui/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : 'Never');

/** Read-only columns — also used by the assistant's `listUsers` table. */
export const userColumns: ColumnDef<PublicUser>[] = [
  {
    accessorKey: 'name',
    header: 'User',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.name}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
      </div>
    ),
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => (
      <Badge variant={row.original.role === 'ADMIN' ? 'default' : 'secondary'}>
        {row.original.role === 'ADMIN' ? 'Admin' : 'User'}
      </Badge>
    ),
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) =>
      row.original.isActive ? (
        <span className="text-sm">Active</span>
      ) : (
        <span className="text-sm text-muted-foreground">Deactivated</span>
      ),
  },
  {
    accessorKey: 'lastLoginAt',
    header: 'Last sign-in',
    cell: ({ row }) => <span className="text-sm tabular-nums">{formatDate(row.original.lastLoginAt)}</span>,
  },
];

interface AdminColumnOptions {
  currentUserId: string | undefined;
  onUpdate: (user: PublicUser, patch: UpdateUserDto) => void;
}

/** Columns for the admin Users screen: read-only columns plus row actions. */
export function buildAdminUserColumns({ currentUserId, onUpdate }: AdminColumnOptions): ColumnDef<PublicUser>[] {
  return [
    ...userColumns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const user = row.original;
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
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={isSelf}
                    onSelect={() => onUpdate(user, { isActive: false })}
                  >
                    Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => onUpdate(user, { isActive: true })}>Reactivate</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
