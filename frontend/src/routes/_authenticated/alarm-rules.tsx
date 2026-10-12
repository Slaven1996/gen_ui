import { useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { ListAlarmDefinitionsQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { SelectFilter } from '@/components/filters/select-filter';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { alarmDefinitionsListQueryOptions } from '@/features/alarms/api/queries';
import { DefinitionFormDialog } from '@/features/alarms/components/definition-form-dialog';
import { DefinitionsTable } from '@/features/alarms/components/definitions-table';
import { AssetSelect } from '@/features/assets/components/asset-select';
import { useAuth } from '@/lib/auth/auth-store';
import { ALARM_CONDITION_OPTIONS, SEVERITY_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

/** The API's query, plus `rule`: the one open in the detail sheet (deep-linkable). */
const rulesSearch = ListAlarmDefinitionsQuerySchema.extend({ rule: z.guid().optional() });
type RulesSearch = z.output<typeof rulesSearch>;

export const Route = createFileRoute('/_authenticated/alarm-rules')({
  staticData: { title: 'Alarm rules' },
  validateSearch: searchSchema(rulesSearch),
  search: { middlewares: [stripSearchParams(defaultsOf(rulesSearch))] },
  loaderDeps: ({ search: { rule: _rule, ...query } }) => query,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(alarmDefinitionsListQueryOptions(deps)),
  component: AlarmRulesPage,
});

function AlarmRulesPage() {
  const { rule: openRule, ...search } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [creating, setCreating] = useState(false);

  const setSearch = (patch: Partial<RulesSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

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
            search.tagId ||
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

      {/* Row actions for admins (edit, delete, enable) and the detail sheet come with the table, the same as in assistant answers. */}
      <DefinitionsTable
        query={search}
        onQueryChange={(next) => navigate({ search: { ...next, rule: openRule }, replace: true })}
        detail={openRule}
        onDetailChange={(id) => navigate({ search: (previous) => ({ ...previous, rule: id }), replace: id === undefined })}
      />

      <DefinitionFormDialog open={creating} onOpenChange={setCreating} />
    </PageContainer>
  );
}
