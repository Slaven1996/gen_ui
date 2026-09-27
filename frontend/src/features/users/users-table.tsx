import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import type { ListUsersQuery, PublicUser, UpdateUserDto } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { usersListQueryOptions } from './queries';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : 'Never');

/** Admin row actions; without them the table is read-only. */
export interface UserActions {
  currentUserId: string | undefined;
  onUpdate: (user: PublicUser, patch: UpdateUserDto) => void;
}

function userColumns({ actions, compact }: { actions?: UserActions; compact: boolean }): ColumnDef<PublicUser>[] {
  const columns: ColumnDef<PublicUser>[] = [
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
    ...(compact
      ? []
      : [
          {
            accessorKey: 'lastLoginAt',
            header: 'Last sign-in',
            cell: ({ row }) => <span className="text-sm tabular-nums">{formatDate(row.original.lastLoginAt)}</span>,
          } satisfies ColumnDef<PublicUser>,
        ]),
  ];
  if (!actions) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <UserRowActions user={row.original} actions={actions} />,
    },
  ];
}

function UserRowActions({ user, actions: { currentUserId, onUpdate } }: { user: PublicUser; actions: UserActions }) {
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

/**
 * Users as a standalone view: the `/users` page (query in the URL, admin
 * actions) and the assistant's answers (a fixed query, paged locally).
 */
export function UsersTable({
  query,
  onQueryChange,
  actions,
  compact = false,
}: {
  query: ListUsersQuery;
  onQueryChange?: (next: ListUsersQuery) => void;
  actions?: UserActions;
  compact?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const users = useQuery(usersListQueryOptions(current));
  const columns = useMemo(() => userColumns({ actions, compact }), [actions, compact]);

  if (users.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(users.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={users.data?.items ?? []}
      getRowId={(user) => user.id}
      isLoading={users.isPending}
      isFetching={users.isPlaceholderData}
      dense={compact}
      emptyMessage="No users match these filters."
      pagination={{
        pageIndex: current.page - 1,
        pageSize: current.pageSize,
        rowCount: users.data?.total ?? 0,
        onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
      }}
    />
  );
}
