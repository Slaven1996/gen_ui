import { useQuery } from '@tanstack/react-query';
import type { ListAuditLogsQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { auditLogsListQueryOptions } from '../api/queries';
import { auditColumns } from '../lib/audit-columns';

/**
 * The audit trail as a standalone table view, the same everywhere: the
 * `/audit` page (query in the URL) and the assistant's answers (a fixed
 * query, paged locally, `dense`). Admin only, like its endpoint.
 */
export function AuditTable({
  query,
  onQueryChange,
  dense = false,
}: {
  query: ListAuditLogsQuery;
  onQueryChange?: (next: ListAuditLogsQuery) => void;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const logs = useQuery(auditLogsListQueryOptions(current));

  if (logs.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(logs.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <DataTable
      columns={auditColumns}
      data={logs.data?.items ?? []}
      getRowId={(log) => log.id}
      isLoading={logs.isPending}
      isFetching={logs.isPlaceholderData}
      dense={dense}
      emptyMessage="No audit records match these filters."
      sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListAuditLogsQuery['sort'], page: 1 }) }}
      pagination={{
        pageIndex: current.page - 1,
        pageSize: current.pageSize,
        rowCount: logs.data?.total ?? 0,
        onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
      }}
    />
  );
}
