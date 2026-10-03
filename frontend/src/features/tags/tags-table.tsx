import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import type { ListTagsQuery, Tag } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { RowActions, type RowAction } from '@/components/row-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssetLink, RelativeTime } from '@/features/alarms/alarm-columns';
import { DefinitionFormDialog } from '@/features/alarms/definition-form-dialog';
import { tagsListQueryOptions, useDeleteTag } from '@/features/assets/api';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';
import { formatReading } from '@/lib/format';
import { TAG_DATA_TYPE } from '@/lib/labels';
import { TagFormDialog } from './tag-form-dialog';

/** Row actions: charting for everyone, the rest for admins. Without them the table is read-only. */
interface TagActions {
  onChart: (tag: Tag) => void;
  onAddRule?: (tag: Tag) => void;
  onEdit?: (tag: Tag) => void;
  onDelete?: (tag: Tag) => void;
}

/**
 * Row actions wherever the full table is shown: the Tags page or an
 * assistant answer. Everyone can chart a tag; admins can also add an alarm
 * rule, edit and delete, with their own dialogs. Compact embeds (an asset's
 * page) get a read-only table. The API enforces the same rules; this only
 * decides what to show.
 */
function useTagActions(enabled: boolean): { actions: TagActions | undefined; dialogs: ReactNode } {
  const { user } = useAuth();
  const isAdmin = enabled && user?.role === 'ADMIN';
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [ruleFor, setRuleFor] = useState<Tag | null>(null);
  const remove = useDeleteTag();

  const actions = useMemo<TagActions | undefined>(
    () =>
      enabled
        ? {
            onChart: (tag) => navigate({ to: '/graphs', search: { tagIds: [tag.id] } }),
            ...(isAdmin && { onAddRule: setRuleFor, onEdit: setEditing, onDelete: setDeleting }),
          }
        : undefined,
    [enabled, isAdmin, navigate],
  );

  const dialogs = isAdmin && (
    <>
      <TagFormDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} tag={editing ?? undefined} />
      <DefinitionFormDialog open={ruleFor !== null} onOpenChange={(open) => !open && setRuleFor(null)} initialTagId={ruleFor?.id} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Its readings are deleted too. Tags with alarm rules or alarm history can't be deleted — deactivate them instead."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
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

/**
 * Tags with their live values, as a standalone view: the `/tags` page (query
 * in the URL), an assistant answer (a fixed query, paged locally, `dense`)
 * and an asset's page (`compact`: fewer columns, and read-only). The page
 * and the assistant get the same row actions.
 */
export function TagsTable({
  query,
  onQueryChange,
  compact = false,
  dense = false,
}: {
  query: ListTagsQuery;
  onQueryChange?: (next: ListTagsQuery) => void;
  compact?: boolean;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
  const tags = useQuery(tagsListQueryOptions(current));
  const { actions, dialogs } = useTagActions(!compact);
  const columns = useMemo(() => tagColumns({ actions, compact }), [actions, compact]);

  if (tags.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(tags.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={tags.data?.items ?? []}
        getRowId={(tag) => tag.id}
        isLoading={tags.isPending}
        isFetching={tags.isPlaceholderData}
        dense={compact || dense}
        emptyMessage="No tags match these filters."
        sort={{ value: current.sort, onChange: (sort) => update({ sort: sort as ListTagsQuery['sort'], page: 1 }) }}
        pagination={{
          pageIndex: current.page - 1,
          pageSize: current.pageSize,
          rowCount: tags.data?.total ?? 0,
          onPaginationChange: ({ pageIndex, pageSize }) => update({ page: pageIndex + 1, pageSize }),
        }}
      />
      {dialogs}
    </>
  );
}
