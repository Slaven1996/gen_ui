import { useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { z } from 'zod';
import { ListAssetsQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { assetsListQueryOptions } from '@/features/assets/api/queries';
import { AssetFormDialog } from '@/features/assets/components/asset-form-dialog';
import { AssetTree } from '@/features/assets/components/asset-tree';
import { AssetsTable } from '@/features/assets/components/assets-table';
import { useAuth } from '@/lib/auth/auth-store';
import { ASSET_TYPE_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

type AssetsSearch = z.output<typeof ListAssetsQuerySchema>;

export const Route = createFileRoute('/_authenticated/assets/')({
  staticData: { title: 'Assets' },
  validateSearch: searchSchema(ListAssetsQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(ListAssetsQuerySchema))] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(assetsListQueryOptions(deps)),
  component: AssetsPage,
});

function AssetsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [creating, setCreating] = useState(false);

  const setSearch = (patch: Partial<AssetsSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Assets"
        description="The plant as a tree. Pick a branch to list everything below it; open an asset for its devices, readings and alarms."
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New asset
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit py-3">
          <CardContent className="px-2">
            <AssetTree selectedId={search.ancestorId} onSelect={(ancestorId) => setSearch({ ancestorId })} />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <FilterBar
            canReset={Boolean(
              search.search || search.type || search.ancestorId || search.parentId || search.isActive !== undefined,
            )}
            onReset={() => navigate({ search: {}, replace: true })}
          >
            <SearchFilter value={search.search} onChange={(value) => setSearch({ search: value })} placeholder="Search name or code" />
            <MultiSelectFilter label="Type" options={ASSET_TYPE_OPTIONS} value={search.type} onChange={(type) => setSearch({ type })} />
          </FilterBar>
          <AssetsTable
            query={search}
            onQueryChange={(next) => navigate({ search: next, replace: true })}
            onAssetClick={(asset) => navigate({ to: '/assets/$assetId', params: { assetId: asset.id } })}
          />
        </div>
      </div>

      {/* Edit and delete for admins come with the table, the same as in assistant answers. */}
      <AssetFormDialog open={creating} onOpenChange={setCreating} parentId={search.ancestorId} />
    </PageContainer>
  );
}
