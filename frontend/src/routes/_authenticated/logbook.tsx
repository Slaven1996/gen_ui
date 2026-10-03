import { useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import type { z } from 'zod';
import { ListLogbookQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { SelectFilter } from '@/components/filters/select-filter';
import { TimeRangeFilter } from '@/components/filters/time-range-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { AssetSelect } from '@/features/assets/asset-select';
import { logbookListQueryOptions } from '@/features/logbook/api';
import { EntryFormDialog } from '@/features/logbook/entry-form-dialog';
import { LogbookTable } from '@/features/logbook/logbook-table';
import { UserFilter } from '@/features/users/user-filter';
import { LOG_SEVERITY_OPTIONS, LOGBOOK_CATEGORY_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

type LogbookSearch = z.output<typeof ListLogbookQuerySchema>;

export const Route = createFileRoute('/_authenticated/logbook')({
  staticData: { title: 'Logbook' },
  validateSearch: searchSchema(ListLogbookQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(ListLogbookQuerySchema))] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(logbookListQueryOptions(deps)),
  component: LogbookPage,
});

function LogbookPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [writing, setWriting] = useState(false);

  const setSearch = (patch: Partial<LogbookSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  const canReset = Boolean(
    search.search ||
      search.category ||
      search.severity ||
      search.source ||
      search.assetId ||
      search.authorId ||
      search.range ||
      search.from ||
      search.to,
  );

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Logbook"
        description="What people wrote and what the system recorded, on one timeline."
        actions={
          <Button onClick={() => setWriting(true)}>
            <PenLine />
            Write entry
          </Button>
        }
      />

      <FilterBar canReset={canReset} onReset={() => navigate({ search: {}, replace: true })}>
        <SearchFilter value={search.search} onChange={(value) => setSearch({ search: value })} placeholder="Search title or text" />
        <MultiSelectFilter label="Type" options={LOGBOOK_CATEGORY_OPTIONS} value={search.category} onChange={(category) => setSearch({ category })} />
        <MultiSelectFilter label="Severity" options={LOG_SEVERITY_OPTIONS} value={search.severity} onChange={(severity) => setSearch({ severity })} />
        <SelectFilter
          label="Source"
          allLabel="People and system"
          options={[
            { value: 'user', label: 'Written by people' },
            { value: 'system', label: 'System events' },
          ]}
          value={search.source}
          onChange={(source) => setSearch({ source })}
        />
        <UserFilter label="Author" value={search.authorId} onChange={(authorId) => setSearch({ authorId })} />
        <AssetSelect value={search.assetId} onChange={(assetId) => setSearch({ assetId })} />
        <TimeRangeFilter value={search} onChange={(range) => setSearch(range)} />
      </FilterBar>

      {/* Row actions (edit your own entries; delete yours, or any as an admin) come with the table, the same as in assistant answers. */}
      <LogbookTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} />

      <EntryFormDialog open={writing} onOpenChange={setWriting} initialAssetId={search.assetId} />
    </PageContainer>
  );
}
