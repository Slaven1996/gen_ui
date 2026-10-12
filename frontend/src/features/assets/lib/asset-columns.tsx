import type { ColumnDef } from '@tanstack/react-table';
import type { Asset } from '@gen-ui/shared';
import { RowActions } from '@/components/row-actions';
import { ASSET_TYPE } from '@/lib/labels';
import type { AssetActions } from '../types';

/** The assets table's columns; the actions column only with admin actions. */
export function assetColumns(actions?: AssetActions): ColumnDef<Asset>[] {
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
