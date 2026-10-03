import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Device, ListDevicesQuery } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { DeviceStatusBadge } from '@/components/domain-badges';
import { RowActions } from '@/components/row-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssetLink, RelativeTime } from '@/features/alarms/alarm-columns';
import { devicesListQueryOptions, useDeleteDevice } from '@/features/assets/api';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';
import { DEVICE_PROTOCOL } from '@/lib/labels';
import { DeviceFormDialog } from './device-form-dialog';

/** Admin row actions; without them the table is read-only. */
interface DeviceActions {
  onEdit: (device: Device) => void;
  onDelete: (device: Device) => void;
}

/**
 * Row actions for admins, wherever the full table is shown: the Devices page
 * or an assistant answer. They bring their own edit and delete dialogs.
 * Everyone else, and compact embeds (an asset's page), get a read-only
 * table. The API enforces the same rule; this only decides what to show.
 */
function useDeviceActions(enabled: boolean): { actions: DeviceActions | undefined; dialogs: ReactNode } {
  const { user } = useAuth();
  const allowed = enabled && user?.role === 'ADMIN';
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const remove = useDeleteDevice();

  const actions = useMemo<DeviceActions | undefined>(
    () => (allowed ? { onEdit: setEditing, onDelete: setDeleting } : undefined),
    [allowed],
  );

  const dialogs = actions && (
    <>
      <DeviceFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        device={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Only devices without tags can be deleted."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
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

/**
 * Devices as a standalone view: the `/devices` page (query in the URL), an
 * assistant answer (a fixed query, paged locally, `dense`) and an asset's
 * page (`compact`: without the asset and protocol columns, and read-only).
 * Admins get the row actions on the page and in the assistant.
 */
export function DevicesTable({
  query,
  onQueryChange,
  compact = false,
  dense = false,
}: {
  query: ListDevicesQuery;
  onQueryChange?: (next: ListDevicesQuery) => void;
  compact?: boolean;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const devices = useQuery(devicesListQueryOptions(current));
  const { actions, dialogs } = useDeviceActions(!compact);
  const columns = useMemo(() => deviceColumns({ actions, compact }), [actions, compact]);

  if (devices.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(devices.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={devices.data?.items ?? []}
        getRowId={(device) => device.id}
        isLoading={devices.isPending}
        isFetching={devices.isPlaceholderData}
        dense={compact || dense}
        emptyMessage="No devices match these filters."
        sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListDevicesQuery['sort'], page: 1 }) }}
        pagination={{
          pageIndex: current.page - 1,
          pageSize: current.pageSize,
          rowCount: devices.data?.total ?? 0,
          onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
        }}
      />
      {dialogs}
    </>
  );
}
