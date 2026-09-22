import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, stripSearchParams } from '@tanstack/react-router';
import { BellRing, ListChecks, Settings2 } from 'lucide-react';
import { z } from 'zod';
import { ListAlarmsQuerySchema, OPEN_ALARM_STATES, UNACKNOWLEDGED_ALARM_STATES, type AlarmState } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { TimeRangeFilter } from '@/components/filters/time-range-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AcknowledgeDialog } from '@/features/alarms/acknowledge-dialog';
import { AlarmDetailSheet } from '@/features/alarms/alarm-detail-sheet';
import { AlarmsTable, canAcknowledge } from '@/features/alarms/alarms-table';
import { alarmsListQueryOptions } from '@/features/alarms/api';
import { summaryQueryOptions } from '@/features/analytics/api';
import { AssetSelect } from '@/features/assets/asset-select';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { ALARM_STATE_OPTIONS, SEVERITY_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';
import { cn } from '@/lib/utils';

/** The API's alarm query, plus `alarm`: the one open in the detail sheet (deep-linkable). */
const alarmsSearch = ListAlarmsQuerySchema.extend({ alarm: z.guid().optional() });
type AlarmsSearch = z.output<typeof alarmsSearch>;

export const Route = createFileRoute('/_authenticated/alarms')({
  staticData: { title: 'Alarms' },
  validateSearch: searchSchema(alarmsSearch),
  search: { middlewares: [stripSearchParams(defaultsOf(alarmsSearch))] },
  loaderDeps: ({ search: { alarm: _alarm, ...query } }) => query,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(alarmsListQueryOptions(deps)),
  component: AlarmsPage,
});

const sameStates = (a: readonly AlarmState[] | undefined, b: readonly AlarmState[] | undefined) =>
  [...(a ?? [])].sort().join() === [...(b ?? [])].sort().join();

function AlarmsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const summary = useQuery(summaryQueryOptions());
  const [selected, setSelected] = useState<string[]>([]);
  const [acknowledging, setAcknowledging] = useState(false);

  const { alarm: openAlarm, ...query } = search;
  const filterKey = JSON.stringify({ ...query, page: undefined, pageSize: undefined, sort: undefined });
  // A new filter shows different rows; a selection from the old ones would be invisible.
  useEffect(() => setSelected([]), [filterKey]);

  const setSearch = (patch: Partial<AlarmsSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });

  const canReset = Boolean(
    query.search || query.state || query.severity || query.assetId || query.range || query.from || query.to,
  );

  useAssistantContext({
    title: 'Alarms',
    summary: [
      'Alarm console',
      query.state && `state ${query.state.join('/')}`,
      query.severity && `severity ${query.severity.join('/')}`,
      query.range && `last ${query.range}`,
      query.search && `search "${query.search}"`,
    ]
      .filter(Boolean)
      .join(', '),
  });

  const quickViews = [
    {
      label: 'Needs attention',
      states: UNACKNOWLEDGED_ALARM_STATES,
      count: summary.data?.alarms.unacknowledged,
      icon: BellRing,
    },
    { label: 'Open', states: OPEN_ALARM_STATES, count: summary.data?.alarms.open, icon: ListChecks },
    { label: 'All alarms', states: undefined, count: undefined, icon: undefined },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Alarms"
        description="Everything the alarm rules raised. Acknowledge what you have seen; conditions clear when values recover."
        actions={
          <Button variant="outline" asChild>
            <Link to="/alarm-rules">
              <Settings2 />
              Alarm rules
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick views">
        {quickViews.map((view) => {
          const active = sameStates(query.state, view.states);
          return (
            <Button
              key={view.label}
              variant={active ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={active}
              className={cn(active && 'font-semibold')}
              onClick={() => setSearch({ state: view.states ? [...view.states] : undefined })}
            >
              {view.icon && <view.icon />}
              {view.label}
              {view.count !== undefined && (
                <Badge variant="outline" className="ml-0.5 tabular-nums">
                  {view.count}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      <FilterBar canReset={canReset} onReset={() => navigate({ search: {}, replace: true })}>
        <SearchFilter
          value={query.search}
          onChange={(value) => setSearch({ search: value })}
          placeholder="Search alarm, rule or tag"
        />
        <MultiSelectFilter
          label="State"
          options={ALARM_STATE_OPTIONS}
          value={query.state}
          onChange={(state) => setSearch({ state })}
        />
        <MultiSelectFilter
          label="Severity"
          options={SEVERITY_OPTIONS}
          value={query.severity}
          onChange={(severity) => setSearch({ severity })}
        />
        <AssetSelect value={query.assetId} onChange={(assetId) => setSearch({ assetId })} />
        <TimeRangeFilter value={query} onChange={(range) => setSearch(range)} />
      </FilterBar>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="tabular-nums">
            {selected.length} selected
          </span>
          <Button size="sm" onClick={() => setAcknowledging(true)}>
            Acknowledge
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      )}

      <AlarmsTable
        query={query}
        onQueryChange={(next) => navigate({ search: { ...next, alarm: openAlarm }, replace: true })}
        onAlarmClick={(alarm) => navigate({ search: (previous) => ({ ...previous, alarm: alarm.id }) })}
        selection={{ selected, onChange: setSelected, canSelect: canAcknowledge }}
      />

      <AlarmDetailSheet
        alarmId={openAlarm}
        onClose={() => navigate({ search: (previous) => ({ ...previous, alarm: undefined }), replace: true })}
      />
      <AcknowledgeDialog
        ids={selected}
        open={acknowledging}
        onOpenChange={setAcknowledging}
        onDone={() => setSelected([])}
      />
    </PageContainer>
  );
}
