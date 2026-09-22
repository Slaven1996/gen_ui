import { useMemo, useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { z } from 'zod';
import { ListTagsQuerySchema, type Tag } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DefinitionFormDialog } from '@/features/alarms/definition-form-dialog';
import { tagsListQueryOptions, useDeleteTag } from '@/features/assets/api';
import { AssetSelect } from '@/features/assets/asset-select';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { TagFormDialog } from '@/features/tags/tag-form-dialog';
import { TagsTable, type TagActions } from '@/features/tags/tags-table';
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
  const [editing, setEditing] = useState<Tag | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [ruleFor, setRuleFor] = useState<Tag | null>(null);
  const remove = useDeleteTag();

  const setSearch = (patch: Partial<TagsSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  const actions = useMemo<TagActions>(
    () => ({
      onChart: (tag) => navigate({ to: '/graphs', search: { tagIds: [tag.id] } }),
      ...(isAdmin && { onAddRule: setRuleFor, onEdit: setEditing, onDelete: setDeleting }),
    }),
    [isAdmin, navigate],
  );

  useAssistantContext({ title: 'Tags', summary: 'Datapoints reported by devices, with their latest value.' });

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Tags"
        description="Every datapoint with its latest reading. Chart any of them, or put an alarm rule on it."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
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
      <TagsTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} actions={actions} />

      <TagFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        tag={editing === 'new' || editing === null ? undefined : editing}
        deviceId={search.deviceId}
      />
      <DefinitionFormDialog open={ruleFor !== null} onOpenChange={(open) => !open && setRuleFor(null)} initialTagId={ruleFor?.id} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Its readings are deleted too. Tags with alarm rules or alarm history can't be deleted — deactivate them instead."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </PageContainer>
  );
}
