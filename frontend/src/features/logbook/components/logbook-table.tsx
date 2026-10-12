import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ListLogbookQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { logbookListQueryOptions } from '../api/queries';
import { useEntryActions } from '../hooks/use-entry-actions';
import { logbookColumns } from '../lib/logbook-columns';

/**
 * The logbook as a table, the same everywhere: the `/logbook` page (query in
 * the URL) and the assistant's answers (a fixed query, paged locally,
 * `dense`), with the same row actions in both.
 */
export function LogbookTable({
  query,
  onQueryChange,
  dense = false,
}: {
  query: ListLogbookQuery;
  onQueryChange?: (next: ListLogbookQuery) => void;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const entries = useQuery(logbookListQueryOptions(current));
  const { actions, dialogs } = useEntryActions();
  const columns = useMemo(() => logbookColumns(actions), [actions]);

  if (entries.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(entries.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={entries.data?.items ?? []}
        getRowId={(entry) => entry.id}
        isLoading={entries.isPending}
        isFetching={entries.isPlaceholderData}
        dense={dense}
        emptyMessage="Nothing in the logbook matches these filters."
        sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListLogbookQuery['sort'], page: 1 }) }}
        pagination={{
          pageIndex: current.page - 1,
          pageSize: current.pageSize,
          rowCount: entries.data?.total ?? 0,
          onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
        }}
      />
      {dialogs}
    </>
  );
}
