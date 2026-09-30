import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import type { z } from 'zod';
import { ListUsersQuerySchema, type Role, type UserStatus } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import type { FilterOption } from '@/components/filters/multi-select-filter';
import { SearchFilter } from '@/components/filters/search-filter';
import { SelectFilter } from '@/components/filters/select-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { LastSignInFilter } from '@/features/users/last-sign-in-filter';
import { usersListQueryOptions } from '@/features/users/queries';
import { CreateUserDialog } from '@/features/users/user-form-dialog';
import { UsersTable } from '@/features/users/users-table';
import { useAuth } from '@/lib/auth/auth-store';
import { defaultsOf, searchSchema } from '@/lib/search';

type UsersSearch = z.output<typeof ListUsersQuerySchema>;

const ROLE_OPTIONS: FilterOption<Role>[] = [
  { value: 'ADMIN', label: 'Admins' },
  { value: 'USER', label: 'Users' },
];

const STATUS_OPTIONS: FilterOption<UserStatus>[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DEACTIVATED', label: 'Deactivated' },
];

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

  useAssistantContext({
    title: 'Users',
    summary: [
      `The people with an account here. Page ${search.page}`,
      users.data && `${users.data.total} users match`,
      search.search && `search "${search.search}"`,
      search.role && `role ${search.role}`,
      search.status && `status ${search.status}`,
      search.lastSignIn && `last sign-in ${search.lastSignIn}`,
    ]
      .filter(Boolean)
      .join(', '),
  });

  // Any filter change starts again from the first page.
  const setFilters = (patch: Partial<UsersSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });
  // Bumped by Reset to remount the last sign-in filter, which may hold an empty "Exact date".
  const [resets, setResets] = useState(0);

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

      <FilterBar
        canReset={Boolean(search.search || search.role || search.status || search.lastSignIn)}
        onReset={() => {
          navigate({ search: {}, replace: true });
          setResets((count) => count + 1);
        }}
      >
        <SearchFilter
          value={search.search}
          onChange={(value) => setFilters({ search: value })}
          placeholder="Search name or email"
        />
        <SelectFilter
          label="Role"
          allLabel="All roles"
          options={ROLE_OPTIONS}
          value={search.role}
          onChange={(role) => setFilters({ role })}
          className="w-36"
        />
        <SelectFilter
          label="Status"
          allLabel="All statuses"
          options={STATUS_OPTIONS}
          value={search.status}
          onChange={(status) => setFilters({ status })}
          className="w-36"
        />
        <LastSignInFilter key={resets} value={search.lastSignIn} onChange={(lastSignIn) => setFilters({ lastSignIn })} />
      </FilterBar>

      {/* Row actions for admins come with the table, the same as in assistant answers. */}
      <UsersTable query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} />
    </PageContainer>
  );
}
