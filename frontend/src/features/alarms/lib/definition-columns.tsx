import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import type { AlarmDefinition } from '@gen-ui/shared';
import { AssetLink } from '@/components/asset-link';
import { SeverityBadge } from '@/components/badges/severity-badge';
import { RowActions } from '@/components/row-actions';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { formatReading } from '@/lib/format';
import { ALARM_CONDITION } from '@/lib/labels';
import type { DefinitionActions } from '../types';

/** The alarm rules table's columns. */
export function definitionColumns(actions?: DefinitionActions): ColumnDef<AlarmDefinition>[] {
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
