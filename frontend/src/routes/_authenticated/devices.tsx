import { useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { z } from 'zod';
import { ListDevicesQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { devicesListQueryOptions } from '@/features/assets/api';
import { AssetSelect } from '@/features/assets/asset-select';
import { DeviceFormDialog } from '@/features/devices/device-form-dialog';
import { DevicesTable } from '@/features/devices/devices-table';
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

      {/* Row actions for admins (edit, delete) come with the table, the same as in assistant answers. */}
      <DevicesTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} />

      <DeviceFormDialog open={creating} onOpenChange={setCreating} assetId={search.assetId} />
    </PageContainer>
  );
}
