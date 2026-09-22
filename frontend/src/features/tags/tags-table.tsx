import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { ListTagsQuery, Tag } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { RowActions, type RowAction } from '@/components/row-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssetLink, RelativeTime } from '@/features/alarms/alarm-columns';
import { tagsListQueryOptions } from '@/features/assets/api';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { formatReading } from '@/lib/format';
import { TAG_DATA_TYPE } from '@/lib/labels';

export interface TagActions {
  onChart: (tag: Tag) => void;
  onAddRule?: (tag: Tag) => void;
  onEdit?: (tag: Tag) => void;
  onDelete?: (tag: Tag) => void;
}

/** A reading as shown in lists: digital tags read as on/off. */
export function TagValue({ tag }: { tag: Pick<Tag, 'lastValue' | 'unit' | 'dataType'> }) {
  if (tag.lastValue === null) return <span className="text-muted-foreground">No data</span>;
  if (tag.dataType === 'DIGITAL') return <span>{tag.lastValue >= 0.5 ? 'On (1)' : 'Off (0)'}</span>;
  return <span>{formatReading(tag.lastValue, tag.unit)}</span>;
}

function tagColumns({ actions, compact }: { actions?: TagActions; compact: boolean }): ColumnDef<Tag>[] {
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

/** Tags with their live values, as a standalone view. */
export function TagsTable({
  query,
  onQueryChange,
  actions,
  compact = false,
}: {
  query: ListTagsQuery;
  onQueryChange?: (next: ListTagsQuery) => void;
  actions?: TagActions;
  compact?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const tags = useQuery(tagsListQueryOptions(current));
  const columns = useMemo(() => tagColumns({ actions, compact }), [actions, compact]);

  if (tags.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(tags.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={tags.data?.items ?? []}
      getRowId={(tag) => tag.id}
      isLoading={tags.isPending}
      isFetching={tags.isPlaceholderData}
      dense={compact}
      emptyMessage="No tags match these filters."
      sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListTagsQuery['sort'], page: 1 }) }}
      pagination={{
        pageIndex: current.page - 1,
        pageSize: current.pageSize,
        rowCount: tags.data?.total ?? 0,
        onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
      }}
    />
  );
}
