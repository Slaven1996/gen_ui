import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { ListUsersQueryInput, Paginated, PublicUser } from '@gen-ui/shared';
import { http } from '@/lib/api/http';

export const usersKeys = {
  all: ['users'] as const,
  list: (params: ListUsersQueryInput) => [...usersKeys.all, 'list', params] as const,
};

export const usersListQueryOptions = (params: ListUsersQueryInput) =>
  queryOptions({
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
