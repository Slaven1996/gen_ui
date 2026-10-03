import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { z } from 'zod';
import { ListTagsQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { tagsListQueryOptions } from '@/features/assets/api';
import { AssetSelect } from '@/features/assets/asset-select';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { TagFormDialog } from '@/features/tags/tag-form-dialog';
import { TagsTable } from '@/features/tags/tags-table';
import { useAuth } from '@/lib/auth/auth-store';
import { TAG_DATA_TYPE_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

type TagsSearch = z.output<typeof ListTagsQuerySchema>;

export const Route = createFileRoute('/_authenticated/tags')({
  staticData: { title: 'Tags' },
  validateSearch: searchSchema(ListTagsQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(ListTagsQuerySchema))] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(tagsListQueryOptions(deps)),
  component: TagsPage,
});

function TagsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [creating, setCreating] = useState(false);
  // The table's own query: this reads the same cache entry, it doesn't fetch twice.
  const tags = useQuery(tagsListQueryOptions(search));

  const setSearch = (patch: Partial<TagsSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  useAssistantContext({
    title: 'Tags',
    summary: [
      `Datapoints reported by devices, with their latest value. Page ${search.page}`,
      tags.data && `${tags.data.total} tags match`,
      search.search && `search "${search.search}"`,
      search.dataType && `type ${search.dataType.join('/')}`,
    ]
      .filter(Boolean)
      .join(', '),
  });

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

      {/* Row actions (chart; for admins also add rule, edit, delete) come with the table, the same as in assistant answers. */}
      <TagsTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} />

      <TagFormDialog open={creating} onOpenChange={setCreating} deviceId={search.deviceId} />
    </PageContainer>
  );
}
