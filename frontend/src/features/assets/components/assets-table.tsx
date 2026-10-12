import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Asset, ListAssetsQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { assetsListQueryOptions } from '../api/queries';
import { useAssetActions } from '../hooks/use-asset-actions';
import { assetColumns } from '../lib/asset-columns';

/**
 * Assets as a standalone view: the `/assets` page (query in the URL) or an
 * assistant answer (a fixed query, paged locally, `dense`). A row click opens
 * the asset. Admins get the row actions in both.
 */
export function AssetsTable({
  query,
  onQueryChange,
  onAssetClick,
  dense = false,
}: {
  query: ListAssetsQuery;
  onQueryChange?: (next: ListAssetsQuery) => void;
  onAssetClick?: (asset: Asset) => void;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const assets = useQuery(assetsListQueryOptions(current));
  const { actions, dialogs } = useAssetActions();
  const columns = useMemo(() => assetColumns(actions), [actions]);

  if (assets.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(assets.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={assets.data?.items ?? []}
        getRowId={(asset) => asset.id}
        isLoading={assets.isPending}
        isFetching={assets.isPlaceholderData}
        dense={dense}
        emptyMessage="No assets match these filters."
        sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListAssetsQuery['sort'], page: 1 }) }}
        pagination={{
          pageIndex: current.page - 1,
          pageSize: current.pageSize,
          rowCount: assets.data?.total ?? 0,
          onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
        }}
        onRowClick={onAssetClick}
      />
      {dialogs}
    </>
  );
}
