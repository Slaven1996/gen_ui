import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { z } from 'zod';
import { ListAlarmDefinitionsQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { SelectFilter } from '@/components/filters/select-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { alarmDefinitionsListQueryOptions } from '@/features/alarms/api';
import { DefinitionFormDialog } from '@/features/alarms/definition-form-dialog';
import { DefinitionsTable } from '@/features/alarms/definitions-table';
import { AssetSelect } from '@/features/assets/asset-select';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { useAuth } from '@/lib/auth/auth-store';
import { ALARM_CONDITION_OPTIONS, SEVERITY_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

type RulesSearch = z.output<typeof ListAlarmDefinitionsQuerySchema>;

export const Route = createFileRoute('/_authenticated/alarm-rules')({
  staticData: { title: 'Alarm rules' },
  validateSearch: searchSchema(ListAlarmDefinitionsQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(ListAlarmDefinitionsQuerySchema))] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(alarmDefinitionsListQueryOptions(deps)),
  component: AlarmRulesPage,
});

function AlarmRulesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [creating, setCreating] = useState(false);
  // The table's own query: this reads the same cache entry, it doesn't fetch twice.
  const rules = useQuery(alarmDefinitionsListQueryOptions(search));

  const setSearch = (patch: Partial<RulesSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  useAssistantContext({
    title: 'Alarm rules',
    summary: [
      `Threshold rules evaluated on every new reading of a tag. Page ${search.page}`,
      rules.data && `${rules.data.total} rules match`,
      search.search && `search "${search.search}"`,
      search.severity && `severity ${search.severity.join(', ')}`,
      search.condition && `condition ${search.condition.join(', ')}`,
      search.isEnabled !== undefined && (search.isEnabled ? 'enabled only' : 'disabled only'),
    ]
      .filter(Boolean)
      .join(', '),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Alarm rules"
        description="Each rule watches one tag. Rules that have fired can be disabled but not deleted, so alarm history stays intact."
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New rule
            </Button>
          )
        }
      />

      <FilterBar
        canReset={Boolean(
          search.search ||
            search.severity ||
            search.condition ||
            search.assetId ||
            search.isEnabled !== undefined,
        )}
        onReset={() => navigate({ search: {}, replace: true })}
      >
        <SearchFilter value={search.search} onChange={(value) => setSearch({ search: value })} placeholder="Search rule or tag" />
        <MultiSelectFilter label="Severity" options={SEVERITY_OPTIONS} value={search.severity} onChange={(severity) => setSearch({ severity })} />
        <MultiSelectFilter
          label="Condition"
          options={ALARM_CONDITION_OPTIONS}
          value={search.condition}
          onChange={(condition) => setSearch({ condition })}
        />
        <AssetSelect value={search.assetId} onChange={(assetId) => setSearch({ assetId })} />
        <SelectFilter
          label="Enabled"
          allLabel="Enabled and disabled"
          options={[
            { value: 'true', label: 'Enabled only' },
            { value: 'false', label: 'Disabled only' },
          ]}
          value={search.isEnabled === undefined ? undefined : search.isEnabled ? 'true' : 'false'}
          onChange={(value) => setSearch({ isEnabled: value === undefined ? undefined : value === 'true' })}
        />
      </FilterBar>

      {/* Row actions for admins (edit, delete, enable) come with the table, the same as in assistant answers. */}
      <DefinitionsTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} />

      <DefinitionFormDialog open={creating} onOpenChange={setCreating} />
    </PageContainer>
  );
}
