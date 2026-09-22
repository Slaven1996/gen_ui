import { useMemo, useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { z } from 'zod';
import { ListAlarmDefinitionsQuerySchema, type AlarmDefinition } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { SelectFilter } from '@/components/filters/select-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import {
  alarmDefinitionsListQueryOptions,
  useDeleteAlarmDefinition,
  useSaveAlarmDefinition,
} from '@/features/alarms/api';
import { DefinitionFormDialog } from '@/features/alarms/definition-form-dialog';
import { DefinitionsTable, type DefinitionActions } from '@/features/alarms/definitions-table';
import { AssetSelect } from '@/features/assets/asset-select';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { useAuth } from '@/lib/auth/auth-store';
import { SEVERITY_OPTIONS } from '@/lib/labels';
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
  const [editing, setEditing] = useState<AlarmDefinition | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AlarmDefinition | null>(null);
  const save = useSaveAlarmDefinition();
  const remove = useDeleteAlarmDefinition();

  const setSearch = (patch: Partial<RulesSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  const actions = useMemo<DefinitionActions | undefined>(
    () =>
      isAdmin
        ? {
            onEdit: setEditing,
            onDelete: setDeleting,
            onToggle: (definition, isEnabled) => save.mutate({ id: definition.id, input: { isEnabled } }),
          }
        : undefined,
    [isAdmin, save.mutate],
  );

  useAssistantContext({
    title: 'Alarm rules',
    summary: 'Threshold rules evaluated on every new reading of a tag.',
  });

  return (
    <PageContainer>
      <PageHeader
        title="Alarm rules"
        description="Each rule watches one tag. Rules that have fired can be disabled but not deleted, so alarm history stays intact."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              New rule
            </Button>
          )
        }
      />

      <FilterBar
        canReset={Boolean(search.search || search.severity || search.assetId || search.isEnabled !== undefined)}
        onReset={() => navigate({ search: {}, replace: true })}
      >
        <SearchFilter value={search.search} onChange={(value) => setSearch({ search: value })} placeholder="Search rule or tag" />
        <MultiSelectFilter label="Severity" options={SEVERITY_OPTIONS} value={search.severity} onChange={(severity) => setSearch({ severity })} />
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

      <DefinitionsTable
        query={search}
        onQueryChange={(next) => navigate({ search: next, replace: true })}
        actions={actions}
      />

      <DefinitionFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        definition={editing === 'new' || editing === null ? undefined : editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete alarm rule?"
        description={
          <>
            “{deleting?.name}” will stop being evaluated. Only rules that never fired can be deleted; disable the others to
            keep their history.
          </>
        }
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </PageContainer>
  );
}
