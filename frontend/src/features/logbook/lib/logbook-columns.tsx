import type { ColumnDef } from '@tanstack/react-table';
import type { LogbookEntry } from '@gen-ui/shared';
import { AssetLink } from '@/components/asset-link';
import { LogSeverityBadge } from '@/components/badges/log-severity-badge';
import { RelativeTime } from '@/components/relative-time';
import { RowActions } from '@/components/row-actions';
import { LOGBOOK_CATEGORY } from '@/lib/labels';
import type { EntryActions } from '../types';

/** The logbook table's columns. */
export function logbookColumns(actions: EntryActions): ColumnDef<LogbookEntry>[] {
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
