import { ListAuditLogsQuerySchema } from '@gen-ui/shared';
import { AuditTable } from '@/features/audit/components/audit-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/** The Audit log page's own table, newest first. Read-only, like the page. */
export function AuditBody({ input }: { input: ToolInput<'listAuditLogs'> }) {
  return <AuditTable query={ListAuditLogsQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })} dense />;
}

