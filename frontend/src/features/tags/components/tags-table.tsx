import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ListTagsQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { tagsListQueryOptions } from '../api/queries';
import { useTagActions } from '../hooks/use-tag-actions';
import { tagColumns } from '../lib/tag-columns';

/**
 * Tags with their live values, as a standalone view: the `/tags` page (query
 * in the URL), an assistant answer (a fixed query, paged locally, `dense`)
 * and an asset's page (`compact`: fewer columns, and read-only). The page
 * and the assistant get the same row actions.
 */
export function TagsTable({
  query,
  onQueryChange,
  compact = false,
  dense = false,
}: {
  query: ListTagsQuery;
  onQueryChange?: (next: ListTagsQuery) => void;
  compact?: boolean;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const tags = useQuery(tagsListQueryOptions(current));
  const { actions, dialogs } = useTagActions(!compact);
  const columns = useMemo(() => tagColumns({ actions, compact }), [actions, compact]);

  if (tags.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(tags.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={tags.data?.items ?? []}
        getRowId={(tag) => tag.id}
        isLoading={tags.isPending}
        isFetching={tags.isPlaceholderData}
        dense={compact || dense}
        emptyMessage="No tags match these filters."
        sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListTagsQuery['sort'], page: 1 }) }}
        pagination={{
          pageIndex: current.page - 1,
          pageSize: current.pageSize,
          rowCount: tags.data?.total ?? 0,
          onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
        }}
      />
      {dialogs}
    </>
  );
}
