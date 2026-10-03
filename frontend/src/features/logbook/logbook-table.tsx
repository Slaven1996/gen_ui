import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { ListLogbookQuery, LogbookEntry } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { LogSeverityBadge } from '@/components/domain-badges';
import { RowActions } from '@/components/row-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssetLink, RelativeTime } from '@/features/alarms/alarm-columns';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';
import { LOGBOOK_CATEGORY } from '@/lib/labels';
import { logbookListQueryOptions, useDeleteLogbookEntry } from './api';
import { EntryFormDialog } from './entry-form-dialog';
import { LogbookTimeline } from './logbook-timeline';

interface EntryActions {
  /** Whether the current user may edit / delete this entry. */
  canEdit: (entry: LogbookEntry) => boolean;
  canDelete: (entry: LogbookEntry) => boolean;
  onEdit: (entry: LogbookEntry) => void;
  onDelete: (entry: LogbookEntry) => void;
}

/**
 * Row actions wherever the table is shown: the Logbook page or an assistant
 * answer. Authors edit their own entries; authors and admins delete them;
 * system events stay as they are. They bring their own dialogs. The API
 * enforces the same rules; this only decides what to show.
 */
function useEntryActions(): { actions: EntryActions; dialogs: ReactNode } {
  const { user } = useAuth();
  const [editing, setEditing] = useState<LogbookEntry | null>(null);
  const [deleting, setDeleting] = useState<LogbookEntry | null>(null);
  const remove = useDeleteLogbookEntry();

  const actions = useMemo<EntryActions>(
    () => ({
      canEdit: (entry) => entry.author?.id === user?.id,
      canDelete: (entry) => entry.author !== null && (entry.author.id === user?.id || user?.role === 'ADMIN'),
      onEdit: setEditing,
      onDelete: setDeleting,
    }),
    [user?.id, user?.role],
  );

  const dialogs = (
    <>
      <EntryFormDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} entry={editing ?? undefined} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this entry?"
        description={<>“{deleting?.title}” will be removed from the logbook. The audit trail keeps a record of the deletion.</>}
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
}

function logbookColumns(actions: EntryActions): ColumnDef<LogbookEntry>[] {
  return [
    {
      id: 'occurredAt',
      header: 'When',
      meta: { sortKey: 'occurredAt', sortFirst: 'desc' },
      cell: ({ row }) => <RelativeTime iso={row.original.occurredAt} />,
    },
    {
      id: 'category',
      header: 'Type',
      meta: { sortKey: 'category' },
      cell: ({ row }) => {
        const { icon: Icon, label } = LOGBOOK_CATEGORY[row.original.category];
        return (
          <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
            <Icon className="size-3.5 text-muted-foreground" aria-hidden />
            {label}
          </span>
        );
      },
    },
    {
      id: 'severity',
      header: 'Severity',
      meta: { sortKey: 'severity' },
      cell: ({ row }) => <LogSeverityBadge severity={row.original.severity} />,
    },
    {
      id: 'entry',
      header: 'Entry',
      meta: { className: 'min-w-72 max-w-xl' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.title}</div>
          {row.original.body && <div className="line-clamp-2 text-xs whitespace-normal text-muted-foreground">{row.original.body}</div>}
        </div>
      ),
    },
    {
      id: 'asset',
      header: 'Asset',
      cell: ({ row }) =>
        row.original.asset ? <AssetLink asset={row.original.asset} /> : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'author',
      header: 'By',
      cell: ({ row }) =>
        row.original.author ? (
          <span className="text-sm whitespace-nowrap">{row.original.author.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">System</span>
        ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const entry = row.original;
        const available = [
          ...(actions.canEdit(entry) ? [{ label: 'Edit', onSelect: () => actions.onEdit(entry) }] : []),
          ...(actions.canDelete(entry) ? [{ label: 'Delete', destructive: true, onSelect: () => actions.onDelete(entry) }] : []),
        ];
        return available.length ? <RowActions label={entry.title} actions={available} /> : null;
      },
    },
  ];
}

/**
 * The logbook as a table, the same everywhere: the `/logbook` page (query in
 * the URL) and the assistant's answers (a fixed query, paged locally,
 * `dense`), with the same row actions in both.
 */
export function LogbookTable({
  query,
  onQueryChange,
  dense = false,
}: {
  query: ListLogbookQuery;
  onQueryChange?: (next: ListLogbookQuery) => void;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const entries = useQuery(logbookListQueryOptions(current));
  const { actions, dialogs } = useEntryActions();
  const columns = useMemo(() => logbookColumns(actions), [actions]);

  if (entries.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(entries.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={entries.data?.items ?? []}
        getRowId={(entry) => entry.id}
        isLoading={entries.isPending}
        isFetching={entries.isPlaceholderData}
        dense={dense}
        emptyMessage="Nothing in the logbook matches these filters."
        sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListLogbookQuery['sort'], page: 1 }) }}
        pagination={{
          pageIndex: current.page - 1,
          pageSize: current.pageSize,
          rowCount: entries.data?.total ?? 0,
          onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
        }}
      />
      {dialogs}
    </>
  );
}

/** The latest entries as a compact timeline — the logbook dashboard widget. */
export function LogbookFeed({ query }: { query: ListLogbookQuery }) {
  const entries = useQuery(logbookListQueryOptions(query));
  if (entries.isError) return <p className="text-sm text-destructive">{getErrorMessage(entries.error)}</p>;
  if (entries.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <LogbookTimeline entries={entries.data.items} className="ml-2.5" />;
}
