import type { ColumnDef } from '@tanstack/react-table';
import type { Device } from '@gen-ui/shared';
import { AssetLink } from '@/components/asset-link';
import { DeviceStatusBadge } from '@/components/badges/device-status-badge';
import { RelativeTime } from '@/components/relative-time';
import { RowActions } from '@/components/row-actions';
import { DEVICE_PROTOCOL } from '@/lib/labels';
import type { DeviceActions } from '../types';

/** The devices table's columns. */
export function deviceColumns({ actions, compact }: { actions?: DeviceActions; compact: boolean }): ColumnDef<Device>[] {
  const columns: ColumnDef<Device>[] = [
    {
      id: 'name',
      header: 'Device',
      meta: { sortKey: 'name', className: 'min-w-52' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.serialNumber}</div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
    },
    ...(compact ? [] : [{ id: 'asset', header: 'Asset', cell: ({ row }) => <AssetLink asset={row.original.asset} /> } satisfies ColumnDef<Device>]),
    {
      id: 'model',
      header: 'Model',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.model ?? '—'}
          {row.original.manufacturer && <div className="text-xs text-muted-foreground">{row.original.manufacturer}</div>}
        </div>
      ),
    },
    ...(compact
      ? []
      : [
          {
            id: 'protocol',
            header: 'Protocol',
            cell: ({ row }) => <span className="text-sm whitespace-nowrap">{DEVICE_PROTOCOL[row.original.protocol]}</span>,
          } satisfies ColumnDef<Device>,
        ]),
    {
      id: 'lastSeenAt',
      header: 'Last reading',
      meta: { sortKey: 'lastSeenAt', sortFirst: 'desc' },
      cell: ({ row }) => <RelativeTime iso={row.original.lastSeenAt} />,
    },
    {
      id: 'tags',
      header: 'Tags',
      cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.tagCount}</span>,
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
            { label: 'Delete', destructive: true, disabled: row.original.tagCount > 0, onSelect: () => actions.onDelete(row.original) },
          ]}
        />
      ),
    },
  ];
}
