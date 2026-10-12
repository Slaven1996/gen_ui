import type { ColumnDef } from '@tanstack/react-table';
import type { AuditLog } from '@gen-ui/shared';
import { RelativeTime } from '@/components/relative-time';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AUDIT_ENTITY } from '@/lib/labels';
import { AuditChanges } from '../components/audit-changes';

/** The audit table's columns. */
export const auditColumns: ColumnDef<AuditLog>[] = [
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
            <AuditChanges changes={row.original.changes} />
          </PopoverContent>
        </Popover>
      ) : null,
  },
];
