import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ListUsersQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { usersListQueryOptions } from '../api/queries';
import { useUserActions } from '../hooks/use-user-actions';
import { userColumns } from '../lib/user-columns';

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
