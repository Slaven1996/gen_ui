import { useMemo, useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { z } from 'zod';
import { ListAssetsQuerySchema, type Asset } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { assetsListQueryOptions, useDeleteAsset } from '@/features/assets/api';
import { AssetFormDialog } from '@/features/assets/asset-form-dialog';
import { AssetTree } from '@/features/assets/asset-tree';
import { AssetsTable, type AssetActions } from '@/features/assets/assets-table';
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
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const remove = useDeleteAsset();

  const setSearch = (patch: Partial<AssetsSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  const actions = useMemo<AssetActions | undefined>(
    () => (isAdmin ? { onEdit: setEditing, onDelete: setDeleting } : undefined),
    [isAdmin],
  );

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Assets"
        description="The plant as a tree. Pick a branch to list everything below it; open an asset for its devices, readings and alarms."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
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
            canReset={Boolean(search.search || search.type || search.ancestorId || search.isActive !== undefined)}
            onReset={() => navigate({ search: {}, replace: true })}
          >
            <SearchFilter value={search.search} onChange={(value) => setSearch({ search: value })} placeholder="Search name or code" />
            <MultiSelectFilter label="Type" options={ASSET_TYPE_OPTIONS} value={search.type} onChange={(type) => setSearch({ type })} />
          </FilterBar>
          <AssetsTable
            query={search}
            onQueryChange={(next) => navigate({ search: next, replace: true })}
            onAssetClick={(asset) => navigate({ to: '/assets/$assetId', params: { assetId: asset.id } })}
            actions={actions}
          />
        </div>
      </div>

      <AssetFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        asset={editing === 'new' || editing === null ? undefined : editing}
        parentId={editing === 'new' ? search.ancestorId : undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="The asset is removed from the tree, together with its alarm history. Only empty assets (no sub-assets or devices) can be deleted."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </PageContainer>
  );
}
