import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Asset, ListAssetsQuery } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { RowActions } from '@/components/row-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';
import { ASSET_TYPE } from '@/lib/labels';
import { assetsListQueryOptions, useDeleteAsset } from './api';
import { AssetFormDialog } from './asset-form-dialog';

/** Admin row actions; without them the table is read-only. */
interface AssetActions {
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
}

/**
 * Row actions for admins, wherever the table is shown: the Assets page or an
 * assistant answer. They bring their own edit and delete dialogs. Everyone
 * else gets a read-only table. The API enforces the same rule; this only
 * decides what to show.
 */
function useAssetActions(): { actions: AssetActions | undefined; dialogs: ReactNode } {
  const { user } = useAuth();
  const allowed = user?.role === 'ADMIN';
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const remove = useDeleteAsset();

  const actions = useMemo<AssetActions | undefined>(
    () => (allowed ? { onEdit: setEditing, onDelete: setDeleting } : undefined),
    [allowed],
  );

  const dialogs = actions && (
    <>
      <AssetFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        asset={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="The asset is removed from the tree, together with its alarm history. Only empty assets (no sub-assets or devices) can be deleted."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
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
