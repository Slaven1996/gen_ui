import { useMemo, useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { z } from 'zod';
import { ListDevicesQuerySchema, type Device } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { devicesListQueryOptions, useDeleteDevice } from '@/features/assets/api';
import { AssetSelect } from '@/features/assets/asset-select';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { DeviceFormDialog } from '@/features/devices/device-form-dialog';
import { DevicesTable, type DeviceActions } from '@/features/devices/devices-table';
import { useAuth } from '@/lib/auth/auth-store';
import { DEVICE_PROTOCOL_OPTIONS, DEVICE_STATUS_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

type DevicesSearch = z.output<typeof ListDevicesQuerySchema>;

export const Route = createFileRoute('/_authenticated/devices')({
  staticData: { title: 'Devices' },
  validateSearch: searchSchema(ListDevicesQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(ListDevicesQuerySchema))] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(devicesListQueryOptions(deps)),
  component: DevicesPage,
});

function DevicesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [editing, setEditing] = useState<Device | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const remove = useDeleteDevice();

  const setSearch = (patch: Partial<DevicesSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  const actions = useMemo<DeviceActions | undefined>(
    () => (isAdmin ? { onEdit: setEditing, onDelete: setDeleting } : undefined),
    [isAdmin],
  );

  useAssistantContext({
    title: 'Devices',
    summary: [
      'RTUs, PLCs and sensors',
      search.status && `status ${search.status.join('/')}`,
      search.search && `search "${search.search}"`,
    ]
      .filter(Boolean)
      .join(', '),
  });

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Devices"
        description="The units that report readings. A device that sends data is marked online automatically."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              Register device
            </Button>
          )
        }
      />
      <FilterBar
        canReset={Boolean(search.search || search.status || search.protocol || search.assetId)}
        onReset={() => navigate({ search: {}, replace: true })}
      >
        <SearchFilter value={search.search} onChange={(value) => setSearch({ search: value })} placeholder="Search name, serial, model" />
        <MultiSelectFilter label="Status" options={DEVICE_STATUS_OPTIONS} value={search.status} onChange={(status) => setSearch({ status })} />
        <MultiSelectFilter label="Protocol" options={DEVICE_PROTOCOL_OPTIONS} value={search.protocol} onChange={(protocol) => setSearch({ protocol })} />
        <AssetSelect value={search.assetId} onChange={(assetId) => setSearch({ assetId })} />
      </FilterBar>
      <DevicesTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} actions={actions} />

      <DeviceFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        device={editing === 'new' || editing === null ? undefined : editing}
        assetId={search.assetId}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Only devices without tags can be deleted."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </PageContainer>
  );
}
