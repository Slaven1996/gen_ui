import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Alarm, ListAlarmsQuery } from '@gen-ui/shared';
import { DataTable, type RowSelection } from '@/components/data-table/data-table';
import { DetailSheet } from '@/components/detail/detail-sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDetailSelection } from '@/hooks/use-detail-selection';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { alarmsListQueryOptions } from '../api/queries';
import { alarmColumns } from '../lib/alarm-columns';
import { AlarmDetail } from './alarm-detail';

/**
 * The alarm list as a standalone view. On `/alarms` it is driven by the URL
 * (`onQueryChange` writes back to it); embedded in a widget, an asset's page
 * or a chat answer it gets a fixed query and pages and sorts on its own.
 * `compact` (widgets, asset pages) drops the least important columns and
 * implies `dense`; `dense` alone (chat answers) keeps every column. A click
 * on a row opens the alarm in a side sheet (acknowledge, clear, chart,
 * timeline) wherever the table is; the page keeps it in its URL (`detail`).
 */
export function AlarmsTable({
  query,
  onQueryChange,
  detail,
  onDetailChange,
  selection,
  compact = false,
  dense = false,
}: {
  query: ListAlarmsQuery;
  onQueryChange?: (next: ListAlarmsQuery) => void;
  detail?: string;
  onDetailChange?: (id: string | undefined) => void;
  selection?: RowSelection<Alarm>;
  compact?: boolean;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const [openId, open] = useDetailSelection(detail, onDetailChange);
  const alarms = useQuery(alarmsListQueryOptions(current));
  const columns = useMemo(() => alarmColumns({ compact }), [compact]);

  if (alarms.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(alarms.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={alarms.data?.items ?? []}
        getRowId={(alarm) => alarm.id}
        isLoading={alarms.isPending}
        isFetching={alarms.isPlaceholderData}
        dense={compact || dense}
        emptyMessage="No alarms match these filters."
        sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListAlarmsQuery['sort'], page: 1 }) }}
        pagination={{
          pageIndex: current.page - 1,
          pageSize: current.pageSize,
          rowCount: alarms.data?.total ?? 0,
          onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
        }}
        selection={selection}
        onRowClick={(alarm) => open(alarm.id)}
      />
      <DetailSheet id={openId} onClose={() => open(undefined)}>
        {(id) => <AlarmDetail alarmId={id} />}
      </DetailSheet>
    </>
  );
}
