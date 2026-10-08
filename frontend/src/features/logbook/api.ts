import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ListAuditLogsQuerySchema,
  ListLogbookQuerySchema,
  type AuditLog,
  type CreateLogbookEntryInput,
  type LogbookEntry,
  type Paginated,
  type UpdateLogbookEntryDto,
} from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate, listQuery, LIVE_REFRESH_MS } from '@/lib/api/list-query';

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

export const auditLogsListQueryOptions =listQuery<typeof ListAuditLogsQuerySchema, Paginated<AuditLog>>(
  'audit-logs',
  '/audit-logs',
  ListAuditLogsQuerySchema,
);

export function useSaveLogbookEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CreateLogbookEntryInput | UpdateLogbookEntryDto }) =>
      (id
        ? await http.patch<LogbookEntry>(`/logbook/${id}`, input)
        : await http.post<LogbookEntry>('/logbook', input)
      ).data,
    onSuccess: (_entry, { id }) => {
      toast.success(id ? 'Entry updated' : 'Entry added to the logbook');
      return invalidate(queryClient, logbookKeys.all, ['audit-logs']);
    },
  });
}

export function useDeleteLogbookEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/logbook/${id}`);
    },
    onSuccess: () => {
      toast.success('Entry deleted');
      return invalidate(queryClient, logbookKeys.all, ['audit-logs']);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
