import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api/errors';

/**
 * The record an edit form opens on, loaded like any other view (not the copy
 * Claude was given): a skeleton until it arrives, or why it can't open (e.g.
 * deleted since).
 */
export function WhenLoaded<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Skeleton className="h-72" />;
  if (query.isError) {
    return (
      <p className="pr-6 text-sm text-destructive" role="alert">
        {getErrorMessage(query.error)}
      </p>
    );
  }
  return children(query.data);
}
