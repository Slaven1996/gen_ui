import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ListDevicesQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { devicesListQueryOptions } from '../api/queries';
import { useDeviceActions } from '../hooks/use-device-actions';
import { deviceColumns } from '../lib/device-columns';

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
