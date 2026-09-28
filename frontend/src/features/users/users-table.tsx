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
import { useAuth } from '@/lib/auth/auth-store';
import { useUpdateUser } from './mutations';
import { usersListQueryOptions } from './queries';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : 'Never');

/** Admin row actions; without them the table is read-only. */
interface UserActions {
  currentUserId: string;
  onUpdate: (user: PublicUser, patch: UpdateUserDto) => void;
}

/**
 * Row actions for admins, wherever the table is shown: the Users page or an
 * assistant answer. Everyone else gets a read-only table. The API enforces
 * the same rule (changing a user is admin-only); this only decides what to show.
 */
function useUserActions(): UserActions | undefined {
  const { user } = useAuth();
  const { mutate } = useUpdateUser();
  const adminId = user?.role === 'ADMIN' ? user.id : undefined;
  return useMemo<UserActions | undefined>(
    () =>
      adminId
        ? { currentUserId: adminId, onUpdate: (target, patch) => mutate({ id: target.id, patch }) }
        : undefined,
    [adminId, mutate],
  );
}

function userColumns(actions: UserActions | undefined): ColumnDef<PublicUser>[] {
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
    {
      accessorKey: 'lastLoginAt',
      header: 'Last sign-in',
      cell: ({ row }) => <span className="text-sm tabular-nums">{formatDate(row.original.lastLoginAt)}</span>,
    },
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
 * Users as a standalone view, the same everywhere: the `/users` page (query
 * in the URL) and the assistant's answers (a fixed query, paged locally,
 * `dense`). Every column, and admin row actions for admins. A change made in
 * one place refreshes every users table on screen.
 */
export function UsersTable({
  query,
  onQueryChange,
  dense = false,
}: {
  query: ListUsersQuery;
  onQueryChange?: (next: ListUsersQuery) => void;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const users = useQuery(usersListQueryOptions(current));
  const actions = useUserActions();
  const columns = useMemo(() => userColumns(actions), [actions]);

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
      dense={dense}
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
