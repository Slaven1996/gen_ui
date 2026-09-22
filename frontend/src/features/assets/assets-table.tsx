import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Asset, ListAssetsQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { RowActions } from '@/components/row-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { ASSET_TYPE } from '@/lib/labels';
import { assetsListQueryOptions } from './api';

export interface AssetActions {
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
}

function assetColumns(actions?: AssetActions): ColumnDef<Asset>[] {
  const columns: ColumnDef<Asset>[] = [
    {
      id: 'name',
      header: 'Asset',
      meta: { sortKey: 'name', className: 'min-w-56' },
      cell: ({ row }) => {
        const { icon: Icon } = ASSET_TYPE[row.original.type];
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-xs text-muted-foreground">{row.original.code}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'type',
      header: 'Type',
      meta: { sortKey: 'type' },
      cell: ({ row }) => <span className="text-sm">{ASSET_TYPE[row.original.type].label}</span>,
    },
    {
      id: 'parent',
      header: 'Parent',
      cell: ({ row }) => <span className="text-sm">{row.original.parent?.name ?? <span className="text-muted-foreground">—</span>}</span>,
    },
    {
      id: 'contents',
      header: 'Contains',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.original.childCount} sub-assets · {row.original.deviceCount} devices
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <span className="text-sm">{row.original.isActive ? 'In service' : 'Out of service'}</span>,
    },
  ];
  if (!actions) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowActions
          label={row.original.name}
          actions={[
            { label: 'Edit', onSelect: () => actions.onEdit(row.original) },
            {
              label: 'Delete',
              destructive: true,
              disabled: row.original.childCount > 0 || row.original.deviceCount > 0,
              onSelect: () => actions.onDelete(row.original),
            },
          ]}
        />
      ),
    },
  ];
}

export function AssetsTable({
  query,
  onQueryChange,
  onAssetClick,
  actions,
}: {
  query: ListAssetsQuery;
  onQueryChange?: (next: ListAssetsQuery) => void;
  onAssetClick?: (asset: Asset) => void;
  actions?: AssetActions;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const assets = useQuery(assetsListQueryOptions(current));
  const columns = useMemo(() => assetColumns(actions), [actions]);

  if (assets.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(assets.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={assets.data?.items ?? []}
      getRowId={(asset) => asset.id}
      isLoading={assets.isPending}
      isFetching={assets.isPlaceholderData}
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
  );
}
