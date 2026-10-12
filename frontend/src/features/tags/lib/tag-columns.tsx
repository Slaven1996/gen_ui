import type { ColumnDef } from '@tanstack/react-table';
import type { Tag } from '@gen-ui/shared';
import { AssetLink } from '@/components/asset-link';
import { RelativeTime } from '@/components/relative-time';
import { RowActions, type RowAction } from '@/components/row-actions';
import { formatReading } from '@/lib/format';
import { TAG_DATA_TYPE } from '@/lib/labels';
import { TagValue } from '../components/tag-value';
import type { TagActions } from '../types';

/** The tags table's columns; `compact` drops the least important ones. */
export function tagColumns({ actions, compact }: { actions?: TagActions; compact: boolean }): ColumnDef<Tag>[] {
  const columns: ColumnDef<Tag>[] = [
    {
      id: 'name',
      header: 'Tag',
      meta: { sortKey: 'name', className: 'min-w-52' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.code}</div>
        </div>
      ),
    },
    {
      id: 'value',
      header: 'Current value',
      cell: ({ row }) => (
        <div className="text-sm whitespace-nowrap tabular-nums">
          <TagValue tag={row.original} />
        </div>
      ),
    },
    {
      id: 'lastValueAt',
      header: 'Updated',
      meta: { sortKey: 'lastValueAt', sortFirst: 'desc' },
      cell: ({ row }) => <RelativeTime iso={row.original.lastValueAt} />,
    },
    ...(compact
      ? []
      : [
          {
            id: 'asset',
            header: 'Asset / device',
            cell: ({ row }) => (
              <div className="text-sm">
                <AssetLink asset={row.original.asset} />
                <div className="text-xs text-muted-foreground">{row.original.device.name}</div>
              </div>
            ),
          } satisfies ColumnDef<Tag>,
          {
            id: 'type',
            header: 'Type',
            cell: ({ row }) => <span className="text-sm">{TAG_DATA_TYPE[row.original.dataType]}</span>,
          } satisfies ColumnDef<Tag>,
          {
            id: 'range',
            header: 'Range',
            cell: ({ row }) =>
              row.original.minValue !== null && row.original.maxValue !== null ? (
                <span className="text-sm whitespace-nowrap tabular-nums">
                  {row.original.minValue} – {formatReading(row.original.maxValue, row.original.unit)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          } satisfies ColumnDef<Tag>,
        ]),
  ];
  if (!actions) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const tag = row.original;
        const items: RowAction[] = [{ label: 'Chart', onSelect: () => actions.onChart(tag) }];
        if (actions.onAddRule) items.push({ label: 'Add alarm rule', onSelect: () => actions.onAddRule?.(tag) });
        if (actions.onEdit) items.push({ label: 'Edit', onSelect: () => actions.onEdit?.(tag) });
        if (actions.onDelete) items.push({ label: 'Delete', destructive: true, onSelect: () => actions.onDelete?.(tag) });
        return <RowActions label={tag.name} actions={items} />;
      },
    },
  ];
}
