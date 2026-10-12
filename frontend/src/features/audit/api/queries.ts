import { ListAuditLogsQuerySchema, type AuditLog, type Paginated } from '@gen-ui/shared';
import { listQuery } from '@/lib/api/list-query';

export const auditKeys = { all: ['audit-logs'] as const };

export const auditLogsListQueryOptions = listQuery<typeof ListAuditLogsQuerySchema, Paginated<AuditLog>>(
  'audit-logs',
  '/audit-logs',
  ListAuditLogsQuerySchema,
);
