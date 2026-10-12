import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ListAlarmDefinitionsQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { DetailSheet } from '@/components/detail/detail-sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDetailSelection } from '@/hooks/use-detail-selection';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { alarmDefinitionsListQueryOptions } from '../api/queries';
import { useDefinitionActions } from '../hooks/use-definition-actions';
import { definitionColumns } from '../lib/definition-columns';
import { DefinitionDetail } from './definition-detail';

/**
 * Alarm rules as a standalone view, the same everywhere: the `/alarm-rules`
 * page (query in the URL) and the assistant's answers (a fixed query, paged
 * locally, `dense`). Admins get the row actions in both places. A click on a
 * row opens the rule in a side sheet, for everyone; the page keeps it in its
 * URL (`detail`), an answer to itself.
 */
export function DefinitionsTable({
  query,
  onQueryChange,
  detail,
  onDetailChange,
  dense = false,
}: {
  query: ListAlarmDefinitionsQuery;
  onQueryChange?: (next: ListAlarmDefinitionsQuery) => void;
  detail?: string;
  onDetailChange?: (id: string | undefined) => void;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const [openId, open] = useDetailSelection(detail, onDetailChange);
  const definitions = useQuery(alarmDefinitionsListQueryOptions(current));
  const { actions, dialogs } = useDefinitionActions();
  const columns = useMemo(() => definitionColumns(actions), [actions]);

  if (definitions.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(definitions.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={definitions.data?.items ?? []}
        getRowId={(definition) => definition.id}
        isLoading={definitions.isPending}
        isFetching={definitions.isPlaceholderData}
        dense={dense}
        emptyMessage="No alarm rules match these filters."
        sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListAlarmDefinitionsQuery['sort'], page: 1 }) }}
        pagination={{
          pageIndex: current.page - 1,
          pageSize: current.pageSize,
          rowCount: definitions.data?.total ?? 0,
          onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
        }}
        onRowClick={(definition) => open(definition.id)}
      />
      {dialogs}
      <DetailSheet id={openId} onClose={() => open(undefined)}>
        {(id) => <DefinitionDetail definitionId={id} />}
      </DetailSheet>
    </>
  );
}
