import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Device, ListDevicesQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { DeviceStatusBadge } from '@/components/domain-badges';
import { RowActions } from '@/components/row-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssetLink, RelativeTime } from '@/features/alarms/alarm-columns';
import { devicesListQueryOptions } from '@/features/assets/api';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { DEVICE_PROTOCOL } from '@/lib/labels';

export interface DeviceActions {
  onEdit: (device: Device) => void;
  onDelete: (device: Device) => void;
}

function deviceColumns({ actions, compact }: { actions?: DeviceActions; compact: boolean }): ColumnDef<Device>[] {
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

/** Devices as a standalone view (the `/devices` page, an asset's page, a widget). */
export function DevicesTable({
  query,
  onQueryChange,
  actions,
  compact = false,
}: {
  query: ListDevicesQuery;
  onQueryChange?: (next: ListDevicesQuery) => void;
  actions?: DeviceActions;
  compact?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const devices = useQuery(devicesListQueryOptions(current));
  const columns = useMemo(() => deviceColumns({ actions, compact }), [actions, compact]);

  if (devices.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(devices.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={devices.data?.items ?? []}
      getRowId={(device) => device.id}
      isLoading={devices.isPending}
      isFetching={devices.isPlaceholderData}
      dense={compact}
      emptyMessage="No devices match these filters."
      sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListDevicesQuery['sort'], page: 1 }) }}
      pagination={{
        pageIndex: current.page - 1,
        pageSize: current.pageSize,
        rowCount: devices.data?.total ?? 0,
        onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
      }}
    />
  );
}
