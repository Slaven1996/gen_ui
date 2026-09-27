import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import type { z } from 'zod';
import { ListUsersQuerySchema, RoleSchema } from '@gen-ui/shared';
import { SearchFilter } from '@/components/filters/search-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { useUpdateUser } from '@/features/users/mutations';
import { usersListQueryOptions } from '@/features/users/queries';
import { CreateUserDialog } from '@/features/users/user-form-dialog';
import { UsersTable, type UserActions } from '@/features/users/users-table';
import { useAuth } from '@/lib/auth/auth-store';
import { defaultsOf, searchSchema } from '@/lib/search';

type UsersSearch = z.output<typeof ListUsersQuerySchema>;

/**
 * Table state lives in the URL, so filters and pages are shareable and survive
 * reloads — but only the parts that differ from the defaults, so arriving from
 * the sidebar leaves a bare `/users`. The directory is open to everyone;
 * changing accounts is not.
 */
export const Route = createFileRoute('/_authenticated/users')({
  staticData: { title: 'Users' },
  validateSearch: searchSchema(ListUsersQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(ListUsersQuerySchema))] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(usersListQueryOptions(deps)),
  component: UsersPage,
});

function UsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  // The table's own query: this reads the same cache entry, it doesn't fetch twice.
  const users = useQuery(usersListQueryOptions(search));
  const updateUser = useUpdateUser();

  const actions = useMemo<UserActions | undefined>(
    () =>
      isAdmin
        ? {
            currentUserId: currentUser?.id,
            onUpdate: (user, patch) => updateUser.mutate({ id: user.id, patch }),
          }
        : undefined,
    [isAdmin, currentUser?.id, updateUser.mutate],
  );

  useAssistantContext({
    title: 'Users',
    summary: [
      `The people with an account here. Page ${search.page}`,
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
        description={
          isAdmin
            ? 'Add teammates, change roles and deactivate accounts.'
            : 'Everyone with access to this app.'
        }
        actions={isAdmin && <CreateUserDialog />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchFilter
          value={search.search}
          onChange={(value) => updateSearch({ search: value, page: 1 })}
          placeholder="Search name or email"
        />
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

      <UsersTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} actions={actions} />
    </PageContainer>
  );
}
