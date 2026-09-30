import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import type { AlarmDefinition, ListAlarmDefinitionsQuery } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { SeverityBadge } from '@/components/domain-badges';
import { RowActions } from '@/components/row-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useViewQuery } from '@/hooks/use-view-query';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';
import { formatReading } from '@/lib/format';
import { ALARM_CONDITION } from '@/lib/labels';
import { AssetLink } from './alarm-columns';
import { alarmDefinitionsListQueryOptions, useDeleteAlarmDefinition, useSaveAlarmDefinition } from './api';
import { DefinitionFormDialog } from './definition-form-dialog';

/** Admin row actions; without them the table is read-only. */
interface DefinitionActions {
  onEdit: (definition: AlarmDefinition) => void;
  onDelete: (definition: AlarmDefinition) => void;
  onToggle: (definition: AlarmDefinition, isEnabled: boolean) => void;
}

/**
 * Row actions for admins, wherever the table is shown: the Alarm rules page
 * or an assistant answer. They bring their own edit and delete dialogs.
 * Everyone else gets a read-only table. The API enforces the same rule
 * (changing a rule is admin-only); this only decides what to show.
 */
function useDefinitionActions(): { actions: DefinitionActions | undefined; dialogs: ReactNode } {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [editing, setEditing] = useState<AlarmDefinition | null>(null);
  const [deleting, setDeleting] = useState<AlarmDefinition | null>(null);
  const { mutate: save } = useSaveAlarmDefinition();
  const remove = useDeleteAlarmDefinition();

  const actions = useMemo<DefinitionActions | undefined>(
    () =>
      isAdmin
        ? {
            onEdit: setEditing,
            onDelete: setDeleting,
            onToggle: (definition, isEnabled) =>
              save({ id: definition.id, input: { isEnabled } }, { onError: (error) => toast.error(getErrorMessage(error)) }),
          }
        : undefined,
    [isAdmin, save],
  );

  const dialogs = actions && (
    <>
      <DefinitionFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        definition={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete alarm rule?"
        description={
          <>
            “{deleting?.name}” will stop being evaluated. Only rules that never fired can be deleted; disable the others to
            keep their history.
          </>
        }
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );

  return { actions, dialogs };
}

function definitionColumns(actions?: DefinitionActions): ColumnDef<AlarmDefinition>[] {
  const columns: ColumnDef<AlarmDefinition>[] = [
    {
      id: 'name',
      header: 'Rule',
      meta: { sortKey: 'name', className: 'min-w-56' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          {row.original.description && (
            <div className="truncate text-xs text-muted-foreground">{row.original.description}</div>
          )}
        </div>
      ),
    },
    {
      id: 'condition',
      header: 'Condition',
      cell: ({ row }) => {
        const { tag, condition, threshold, deadband } = row.original;
        return (
          <div className="text-sm whitespace-nowrap">
            {tag.name} {ALARM_CONDITION[condition].symbol} {formatReading(threshold, tag.unit)}
            {deadband > 0 && <div className="text-xs text-muted-foreground">deadband {formatReading(deadband, tag.unit)}</div>}
          </div>
        );
      },
    },
    { id: 'asset', header: 'Asset', cell: ({ row }) => <AssetLink asset={row.original.asset} /> },
    {
      id: 'severity',
      header: 'Severity',
      meta: { sortKey: 'severity' },
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
    },
    {
      id: 'open',
      header: 'Open alarms',
      cell: ({ row }) =>
        row.original.openAlarmCount > 0 ? (
          <Badge variant="outline" asChild>
            <Link to="/alarms" search={{ definitionId: [row.original.id], state: ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED'] }}>
              {row.original.openAlarmCount} open
            </Link>
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        ),
    },
    {
      id: 'enabled',
      header: 'Enabled',
      cell: ({ row }) =>
        actions ? (
          <Switch
            checked={row.original.isEnabled}
            onCheckedChange={(checked) => actions.onToggle(row.original, checked)}
            aria-label={`${row.original.isEnabled ? 'Disable' : 'Enable'} ${row.original.name}`}
          />
        ) : (
          <span className="text-sm">{row.original.isEnabled ? 'Yes' : 'No'}</span>
        ),
    },
  ];
  if (!actions) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowActions
          label={row.original.name}
          actions={[
            { label: 'Edit', onSelect: () => actions.onEdit(row.original) },
            { label: 'Delete', destructive: true, onSelect: () => actions.onDelete(row.original) },
          ]}
        />
      ),
    },
  ];
}

/**
 * Alarm rules as a standalone view, the same everywhere: the `/alarm-rules`
 * page (query in the URL) and the assistant's answers (a fixed query, paged
 * locally, `dense`). Admins get the row actions in both places.
 */
export function DefinitionsTable({
  query,
  onQueryChange,
  dense = false,
}: {
  query: ListAlarmDefinitionsQuery;
  onQueryChange?: (next: ListAlarmDefinitionsQuery) => void;
  dense?: boolean;
}) {
  const [current, update] = useViewQuery(query, onQueryChange);
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
      />
      {dialogs}
    </>
  );
}
