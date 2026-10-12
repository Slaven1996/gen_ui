import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateLogbookEntryInput, LogbookEntry, UpdateLogbookEntryDto } from '@gen-ui/shared';
import { auditKeys } from '@/features/audit/api/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate } from '@/lib/api/list-query';
import { logbookKeys } from './queries';

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
      return invalidate(queryClient, logbookKeys.all, auditKeys.all);
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
      return invalidate(queryClient, logbookKeys.all, auditKeys.all);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
