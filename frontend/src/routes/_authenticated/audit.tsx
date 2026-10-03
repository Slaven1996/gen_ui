import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, stripSearchParams } from '@tanstack/react-router';
import type { z } from 'zod';
import { ListAuditLogsQuerySchema } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { SelectFilter } from '@/components/filters/select-filter';
import { describeTimeRange, TimeRangeFilter } from '@/components/filters/time-range-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { auditLogsListQueryOptions } from '@/features/logbook/api';
import { AuditTable } from '@/features/logbook/audit-table';
import { UserFilter } from '@/features/users/user-filter';
import { AUDIT_ENTITY_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

type AuditSearch = z.output<typeof ListAuditLogsQuerySchema>;

/** Action families, as prefixes the API matches (`alarm.` = every alarm action). */
const ACTION_OPTIONS = [
  { value: 'auth.', label: 'Sign-ins' },
  { value: 'user.', label: 'Accounts' },
  { value: 'asset.', label: 'Assets' },
  { value: 'device.', label: 'Devices' },
  { value: 'tag.', label: 'Tags' },
  { value: 'alarm.', label: 'Alarms' },
  { value: 'alarm_definition.', label: 'Alarm rules' },
  { value: 'logbook.', label: 'Logbook' },
  { value: 'shift_template.', label: 'Shift templates' },
  { value: 'shift_assignment.', label: 'Shift schedule' },
  { value: 'dashboard.', label: 'Dashboards' },
];

/** The families, plus an exact action (`alarm.acknowledge`) when a link brings one, so the select can show it. */
const actionOptions = (action: string | undefined) =>
  action && !ACTION_OPTIONS.some((option) => option.value === action)
    ? [...ACTION_OPTIONS, { value: action, label: action }]
    : ACTION_OPTIONS;

export const Route = createFileRoute('/_authenticated/audit')({
  staticData: { title: 'Audit log' },
  validateSearch: searchSchema(ListAuditLogsQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(ListAuditLogsQuerySchema))] },
  beforeLoad: ({ context }) => {
    if (context.auth.getSnapshot().user?.role !== 'ADMIN') throw redirect({ to: '/dashboard' });
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(auditLogsListQueryOptions(deps)),
  component: AuditPage,
});

function AuditPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // The table's own query: this reads the same cache entry, it doesn't fetch twice.
  const logs = useQuery(auditLogsListQueryOptions(search));
  const setSearch = (patch: Partial<AuditSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  useAssistantContext({
    title: 'Audit log',
    summary: [
      `Who changed what, and when. Admin only. Page ${search.page}`,
      logs.data && `${logs.data.total} records match`,
      search.search && `search "${search.search}"`,
      search.action && `action ${search.action}`,
      (search.range || search.from || search.to) && describeTimeRange(search),
    ]
      .filter(Boolean)
      .join(', '),
  });

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Audit log"
        description="Every change and acknowledgement, recorded in the same transaction as the change itself."
      />
      <FilterBar
        canReset={Boolean(
          search.search ||
            search.action ||
            search.entityType ||
            search.actorId ||
            search.range ||
            search.from ||
            search.to,
        )}
        onReset={() => navigate({ search: {}, replace: true })}
      >
        <SearchFilter value={search.search} onChange={(value) => setSearch({ search: value })} placeholder="Search what happened" />
        <SelectFilter
          label="Action"
          allLabel="All actions"
          options={actionOptions(search.action)}
          value={search.action}
          onChange={(action) => setSearch({ action })}
        />
        <MultiSelectFilter label="Record" options={AUDIT_ENTITY_OPTIONS} value={search.entityType} onChange={(entityType) => setSearch({ entityType })} />
        <UserFilter label="Who" value={search.actorId} onChange={(actorId) => setSearch({ actorId })} />
        <TimeRangeFilter value={search} onChange={(range) => setSearch(range)} />
      </FilterBar>
      <AuditTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} />
    </PageContainer>
  );
}
