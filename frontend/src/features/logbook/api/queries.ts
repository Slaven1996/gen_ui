import { queryOptions } from '@tanstack/react-query';
import { ListLogbookQuerySchema, type LogbookEntry, type Paginated } from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { listQuery, LIVE_REFRESH_MS } from '@/lib/api/list-query';

export const logbookKeys = { all: ['logbook'] as const };

export const logbookListQueryOptions = listQuery<typeof ListLogbookQuerySchema, Paginated<LogbookEntry>>(
  'logbook',
  '/logbook',
  ListLogbookQuerySchema,
  { refetchInterval: LIVE_REFRESH_MS },
);

export const logbookEntryQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...logbookKeys.all, 'detail', id] as const,
    queryFn: async () => (await http.get<LogbookEntry>(`/logbook/${id}`)).data,
  });
