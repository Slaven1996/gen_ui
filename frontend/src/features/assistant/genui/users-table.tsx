import { DataTable } from '@/components/data-table/data-table';
import { userColumns } from '@/features/users/columns';
import { ToolError, ToolSkeleton } from './tool-status';
import type { ToolPartFor } from './types';

/** Data tool: the server ran the query; we render its result with the same table as the Users screen. */
export function UsersTableTool({ part }: { part: ToolPartFor<'listUsers'> }) {
  switch (part.state) {
    case 'output-error':
      return <ToolError title="Couldn’t load users" message={part.errorText} />;
    case 'output-available': {
      const { users, total } = part.output;
      return (
        <div className="space-y-2">
          <DataTable columns={userColumns} data={users} pageSize={5} getRowId={(user) => user.id} emptyMessage="No users match." />
          <p className="text-xs text-muted-foreground">
            Showing {users.length} of {total} {total === 1 ? 'user' : 'users'}.
          </p>
        </div>
      );
    }
    default:
      return <ToolSkeleton label="Looking up users…" shape="table" />;
  }
}
