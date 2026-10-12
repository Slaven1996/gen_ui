import type { ColumnDef } from '@tanstack/react-table';
import type { PublicUser } from '@gen-ui/shared';
import { Badge } from '@/components/ui/badge';
import { UserRowActions } from '../components/user-row-actions';
import type { UserActions } from '../types';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : 'Never');

/** The users table's columns; the actions column only with admin actions. */
export function userColumns(actions: UserActions | undefined): ColumnDef<PublicUser>[] {
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
