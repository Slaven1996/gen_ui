import { useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { ListTagsQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { AssetSelect } from '@/features/assets/components/asset-select';
import { tagsListQueryOptions } from '@/features/tags/api/queries';
import { TagFormDialog } from '@/features/tags/components/tag-form-dialog';
import { TagsTable } from '@/features/tags/components/tags-table';
import { useAuth } from '@/lib/auth/auth-store';
import { TAG_DATA_TYPE_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

/** The API's query, plus `tag`: the one open in the detail sheet (deep-linkable). */
const tagsSearch = ListTagsQuerySchema.extend({ tag: z.guid().optional() });
type TagsSearch = z.output<typeof tagsSearch>;

export const Route = createFileRoute('/_authenticated/tags')({
  staticData: { title: 'Tags' },
  validateSearch: searchSchema(tagsSearch),
  search: { middlewares: [stripSearchParams(defaultsOf(tagsSearch))] },
  loaderDeps: ({ search: { tag: _tag, ...query } }) => query,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(tagsListQueryOptions(deps)),
  component: TagsPage,
});

function TagsPage() {
  const { tag: openTag, ...search } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [creating, setCreating] = useState(false);

  const setSearch = (patch: Partial<TagsSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Tags"
        description="Every datapoint with its latest reading. Chart any of them, or put an alarm rule on it."
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New tag
            </Button>
          )
        }
      />
      <FilterBar
        canReset={Boolean(search.search || search.dataType || search.assetId || search.deviceId || search.ids)}
        onReset={() => navigate({ search: {}, replace: true })}
      >
        <SearchFilter value={search.search} onChange={(value) => setSearch({ search: value })} placeholder="Search name, code, unit" />
        <MultiSelectFilter label="Type" options={TAG_DATA_TYPE_OPTIONS} value={search.dataType} onChange={(dataType) => setSearch({ dataType })} />
        <AssetSelect value={search.assetId} onChange={(assetId) => setSearch({ assetId })} />
      </FilterBar>

      {/* Row actions (chart; for admins also add rule, edit, delete) and the detail sheet come with the table, the same as in assistant answers. */}
      <TagsTable
        query={search}
        onQueryChange={(next) => navigate({ search: { ...next, tag: openTag }, replace: true })}
        detail={openTag}
        onDetailChange={(id) => navigate({ search: (previous) => ({ ...previous, tag: id }), replace: id === undefined })}
      />

      <TagFormDialog open={creating} onOpenChange={setCreating} deviceId={search.deviceId} />
    </PageContainer>
  );
}
