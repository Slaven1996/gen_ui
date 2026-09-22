import { keepPreviousData, queryOptions, type QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { http } from './http';
import { parseLeniently } from '../search';

/**
 * Query options for a list endpoint, keyed by the *parsed* query. A page
 * passing its URL state and a widget passing a partial config reach the same
 * cache entry when they ask for the same thing.
 */
export function listQuery<S extends z.ZodObject, TResult>(
  root: string,
  path: string,
  schema: S,
  { refetchInterval }: { refetchInterval?: number } = {},
) {
  return (query: z.input<S> = {} as z.input<S>) => {
    const params = parseLeniently(schema, query);
    return queryOptions({
      queryKey: [root, 'list', params] as const,
      // No abort `signal` on purpose: consuming it makes TanStack Query cancel the
      // fetch when the last observer unmounts, which rejects a route loader
      // awaiting the same query.
      queryFn: async () => (await http.get<TResult>(path, { params })).data,
      // Keep the current page on screen while the next one loads.
      placeholderData: keepPreviousData,
      refetchInterval,
    });
  };
}

/** Readings and alarms change on their own; views of them poll. */
export const LIVE_REFRESH_MS = 30_000;

/** Invalidate several query roots at once, e.g. after an alarm changes state. */
export function invalidate(queryClient: QueryClient, ...roots: Array<readonly unknown[]>) {
  return Promise.all(roots.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
