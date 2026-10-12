import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { ListUsersQueryInput, Paginated, PublicUser, UserRef } from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { browserTimeZone } from '@/lib/search';

export const usersKeys = {
  all: ['users'] as const,
  list: (params: ListUsersQueryInput) => [...usersKeys.all, 'list', params] as const,
};

/**
 * `timeZone` is always the viewer's: "last signed in on 3 May" means their
 * 3 May, the same day the Last sign-in column shows.
 */
export const usersListQueryOptions = (query: ListUsersQueryInput) => {
  const params = { ...query, timeZone: browserTimeZone };
  return queryOptions({
    queryKey: usersKeys.list(params),
    // No abort `signal` on purpose: consuming it makes TanStack Query cancel the
    // fetch when the last observer unmounts, which rejects the route loader
    // awaiting the same query (e.g. under StrictMode's double mount).
    queryFn: async () => {
      const { data } = await http.get<Paginated<PublicUser>>('/users', { params });
      return data;
    },
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
};

/** Active people by name, for pickers — open to every role. */
export const userOptionsQueryOptions = () =>
  queryOptions({
    queryKey: [...usersKeys.all, 'options'] as const,
    queryFn: async () => (await http.get<{ items: UserRef[] }>('/users/options')).data.items,
    staleTime: 5 * 60_000,
  });
