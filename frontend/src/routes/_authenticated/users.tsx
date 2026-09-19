import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { z } from 'zod';
import { RoleSchema, type ListUsersQueryInput } from '@gen-ui/shared';
import { DataTable } from '@/components/data-table/data-table';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { buildAdminUserColumns } from '@/features/users/columns';
import { useUpdateUser } from '@/features/users/mutations';
import { usersListQueryOptions } from '@/features/users/queries';
import { CreateUserDialog } from '@/features/users/user-form-dialog';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';

/** Table state lives in the URL, so filters and pages are shareable and survive reloads. */
const usersSearchSchema = z.object({
  page: z.number().int().min(1).default(1).catch(1),
  pageSize: z.number().int().min(5).max(100).default(20).catch(20),
  search: z.string().max(100).default('').catch(''),
  role: RoleSchema.optional().catch(undefined),
});
type UsersSearch = z.output<typeof usersSearchSchema>;

const toApiParams = ({ page, pageSize, search, role }: UsersSearch): ListUsersQueryInput => ({
  page,
  pageSize,
  ...(search && { search }),
  ...(role && { role }),
});

export const Route = createFileRoute('/_authenticated/users')({
  staticData: { title: 'Users' },
  validateSearch: usersSearchSchema,
  beforeLoad: ({ context }) => {
    if (context.auth.getSnapshot().user?.role !== 'ADMIN') throw redirect({ to: '/dashboard' });
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(usersListQueryOptions(toApiParams(deps))),
  component: UsersPage,
});

function UsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user: currentUser } = useAuth();
  const users = useQuery(usersListQueryOptions(toApiParams(search)));
  const updateUser = useUpdateUser();

  const columns = useMemo(
    () =>
      buildAdminUserColumns({
        currentUserId: currentUser?.id,
        onUpdate: (user, patch) => updateUser.mutate({ id: user.id, patch }),
      }),
    [currentUser?.id, updateUser.mutate],
  );

  useAssistantContext({
    title: 'Users',
    summary: [
      `Admin user management. Page ${search.page}`,
      users.data && `${users.data.total} users match`,
      search.search && `search "${search.search}"`,
      search.role && `role ${search.role}`,
    ]
      .filter(Boolean)
      .join(', '),
  });

  const updateSearch = (patch: Partial<UsersSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });

  return (
    <PageContainer>
      <PageHeader
        title="Users"
        description="Add teammates, change roles and deactivate accounts."
        actions={<CreateUserDialog />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search.search} onChange={(value) => updateSearch({ search: value, page: 1 })} />
        <Select
          value={search.role ?? 'ALL'}
          onValueChange={(value) =>
            updateSearch({ role: value === 'ALL' ? undefined : RoleSchema.parse(value), page: 1 })
          }
        >
          <SelectTrigger className="w-36" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            <SelectItem value="ADMIN">Admins</SelectItem>
            <SelectItem value="USER">Users</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {users.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{getErrorMessage(users.error)}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          data={users.data?.items ?? []}
          getRowId={(user) => user.id}
          isLoading={users.isPending}
          isFetching={users.isPlaceholderData}
          emptyMessage="No users match these filters."
          pagination={{
            pageIndex: search.page - 1,
            pageSize: search.pageSize,
            rowCount: users.data?.total ?? 0,
            onPaginationChange: ({ pageIndex, pageSize }) => updateSearch({ page: pageIndex + 1, pageSize }),
          }}
        />
      )}
    </PageContainer>
  );
}

/** Debounced so typing doesn't fire a request per keystroke. */
function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft.trim() === value) return;
    const timer = window.setTimeout(() => onChange(draft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Search name or email"
        aria-label="Search users"
        className="pl-8"
      />
    </div>
  );
}
