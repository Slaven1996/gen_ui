import { useQuery } from '@tanstack/react-query';
import type { ListLogbookQuery } from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { logbookListQueryOptions } from '../api/queries';
import { LogbookTimeline } from './logbook-timeline';

/** The latest entries as a compact timeline — the logbook dashboard widget. */
export function LogbookFeed({ query }: { query: ListLogbookQuery }) {
  const entries = useQuery(logbookListQueryOptions(query));
  if (entries.isError) return <p className="text-sm text-destructive">{getErrorMessage(entries.error)}</p>;
  if (entries.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <LogbookTimeline entries={entries.data.items} className="ml-2.5" />;
}
