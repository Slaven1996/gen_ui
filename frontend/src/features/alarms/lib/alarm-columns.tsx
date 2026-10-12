import type { ColumnDef } from '@tanstack/react-table';
import type { Alarm } from '@gen-ui/shared';
import { AssetLink } from '@/components/asset-link';
import { AlarmStateBadge } from '@/components/badges/alarm-state-badge';
import { SeverityBadge } from '@/components/badges/severity-badge';
import { RelativeTime } from '@/components/relative-time';
import { durationBetween, formatDuration, formatReading, formatRelative } from '@/lib/format';

/** The alarm console's columns. `compact` drops the least important ones for embeds. */
export function alarmColumns({ compact = false }: { compact?: boolean } = {}): ColumnDef<Alarm>[] {
  const columns: ColumnDef<Alarm>[] = [
    {
      id: 'severity',
      header: 'Severity',
      meta: { sortKey: 'severity' },
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
    },
    {
      id: 'state',
      header: 'State',
      meta: { sortKey: 'state' },
      cell: ({ row }) => <AlarmStateBadge state={row.original.state} />,
    },
    {
      id: 'alarm',
      header: 'Alarm',
      meta: { className: 'min-w-64' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.definition.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.tag.name} · tripped at {formatReading(row.original.triggerValue, row.original.tag.unit)}
          </div>
        </div>
      ),
    },
    {
      id: 'asset',
      header: 'Asset',
      cell: ({ row }) => <AssetLink asset={row.original.asset} />,
    },
    {
      id: 'raisedAt',
      header: 'Raised',
      meta: { sortKey: 'raisedAt', sortFirst: 'desc' },
      cell: ({ row }) => <RelativeTime iso={row.original.raisedAt} />,
    },
  ];

  if (compact) return columns;

  return [
    ...columns,
    {
      id: 'duration',
      header: 'Duration',
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap tabular-nums">
          {formatDuration(durationBetween(row.original.raisedAt, row.original.clearedAt))}
          {!row.original.clearedAt && <span className="text-muted-foreground"> so far</span>}
        </span>
      ),
    },
    {
      id: 'acknowledgedAt',
      header: 'Acknowledged',
      meta: { sortKey: 'acknowledgedAt', sortFirst: 'desc' },
      cell: ({ row }) =>
        row.original.acknowledgedBy ? (
          <div className="text-sm whitespace-nowrap">
            {row.original.acknowledgedBy.name}
            <div className="text-xs text-muted-foreground">{formatRelative(row.original.acknowledgedAt)}</div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Not yet</span>
        ),
    },
  ];
}
