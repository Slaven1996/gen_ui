import { ListUsersQuerySchema } from '@gen-ui/shared';
import { UsersTable } from '@/features/users/components/users-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/**
 * The Users page's own table with the call's filters, five rows a page: the
 * same columns, and the same row actions for admins.
 */
export function UsersBody({ input }: { input: ToolInput<'listUsers'> }) {
  return <UsersTable query={ListUsersQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })} dense />;
}

