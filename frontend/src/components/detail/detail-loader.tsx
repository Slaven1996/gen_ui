import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api/errors';
import { DetailHeader } from './detail-header';

/**
 * A detail's record: a placeholder while it loads, the error when it can't
 * (e.g. deleted since the link was made), then `children` with the data.
 * `title` names the kind of record until its own name is known. A failed
 * background refresh keeps the record on screen.
 */
export function DetailLoader<T>({
  query,
  title,
  action,
  children,
}: {
  query: UseQueryResult<T>;
  title: string;
  action?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.data !== undefined) return children(query.data);
  return (
    <>
      <DetailHeader title={title} description={query.isError ? 'Couldn’t load it.' : 'Loading…'} action={action} />
      <div className="px-4 pb-6">
        {query.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{getErrorMessage(query.error)}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-40" />
        )}
      </div>
    </>
  );
}
