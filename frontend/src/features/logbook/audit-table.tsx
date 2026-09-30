import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AuditLog, ListAuditLogsQuery } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RelativeTime } from '@/features/alarms/alarm-columns';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { AUDIT_ENTITY } from '@/lib/labels';
import { auditLogsListQueryOptions } from './api';

const show = (value: unknown) => (value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));

/** `{ field: { from, to } }` as a small before → after table; anything else as JSON. */
function Changes({ changes }: { changes: Record<string, unknown> }) {
  const entries = Object.entries(changes);
  const isDiff = entries.every(([, value]) => value && typeof value === 'object' && 'from' in value && 'to' in value);
  if (!isDiff) {
    return <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(changes, null, 2)}</pre>;
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([field, value]) => {
          const { from, to } = value as { from: unknown; to: unknown };
          return (
            <tr key={field} className="border-b last:border-0">
              <td className="py-1 pr-2 font-medium">{field}</td>
              <td className="py-1 pr-2 break-all text-muted-foreground line-through">{show(from)}</td>
              <td className="py-1 break-all">{show(to)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const columns: ColumnDef<AuditLog>[] = [
  {
    id: 'createdAt',
    header: 'When',
    meta: { sortKey: 'createdAt', sortFirst: 'desc' },
    cell: ({ row }) => <RelativeTime iso={row.original.createdAt} />,
  },
  {
    id: 'actor',
    header: 'Who',
    cell: ({ row }) => <span className="text-sm whitespace-nowrap">{row.original.actor?.name ?? 'System'}</span>,
  },
  {
    id: 'action',
    header: 'Action',
    meta: { sortKey: 'action' },
    cell: ({ row }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.action}</code>,
  },
  {
    id: 'entityType',
    header: 'Record',
    meta: { sortKey: 'entityType' },
    cell: ({ row }) => <span className="text-sm whitespace-nowrap">{AUDIT_ENTITY[row.original.entityType]}</span>,
  },
  {
    id: 'summary',
    header: 'What happened',
    meta: { className: 'min-w-72' },
    cell: ({ row }) => <span className="text-sm whitespace-normal">{row.original.summary}</span>,
  },
  {
    id: 'changes',
    header: () => <span className="sr-only">Changes</span>,
    cell: ({ row }) =>
      row.original.changes ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Changes
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96">
            <Changes changes={row.original.changes} />
          </PopoverContent>
        </Popover>
      ) : null,
  },
];

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
      columns={columns}
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
