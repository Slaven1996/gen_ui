import { useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { ListDevicesQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { AssetSelect } from '@/features/assets/components/asset-select';
import { devicesListQueryOptions } from '@/features/devices/api/queries';
import { DeviceFormDialog } from '@/features/devices/components/device-form-dialog';
import { DevicesTable } from '@/features/devices/components/devices-table';
import { useAuth } from '@/lib/auth/auth-store';
import { DEVICE_PROTOCOL_OPTIONS, DEVICE_STATUS_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

/** The API's query, plus `device`: the one open in the detail sheet (deep-linkable). */
const devicesSearch = ListDevicesQuerySchema.extend({ device: z.guid().optional() });
type DevicesSearch = z.output<typeof devicesSearch>;

export const Route = createFileRoute('/_authenticated/devices')({
  staticData: { title: 'Devices' },
  validateSearch: searchSchema(devicesSearch),
  search: { middlewares: [stripSearchParams(defaultsOf(devicesSearch))] },
  loaderDeps: ({ search: { device: _device, ...query } }) => query,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(devicesListQueryOptions(deps)),
  component: DevicesPage,
});

function DevicesPage() {
  const { device: openDevice, ...search } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [creating, setCreating] = useState(false);

  const setSearch = (patch: Partial<DevicesSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Devices"
        description="The units that report readings. A device that sends data is marked online automatically."
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
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

      {/* Row actions for admins (edit, delete) and the detail sheet come with the table, the same as in assistant answers. */}
      <DevicesTable
        query={search}
        onQueryChange={(next) => navigate({ search: { ...next, device: openDevice }, replace: true })}
        detail={openDevice}
        onDetailChange={(id) => navigate({ search: (previous) => ({ ...previous, device: id }), replace: id === undefined })}
      />

      <DeviceFormDialog open={creating} onOpenChange={setCreating} assetId={search.assetId} />
    </PageContainer>
  );
}
