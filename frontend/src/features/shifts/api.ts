import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  OnDutyQuerySchema,
  ShiftCalendarQuerySchema,
  type CopyShiftWeekInput,
  type CreateShiftAssignmentInput,
  type CreateShiftTemplateInput,
  type OnDuty,
  type OnDutyQueryInput,
  type ShiftCalendar,
  type ShiftCalendarQueryInput,
  type ShiftChangeResult,
  type ShiftRemoveResult,
  type ShiftScope,
  type ShiftTemplate,
  type UpdateShiftAssignmentInput,
  type UpdateShiftTemplateDto,
} from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate, LIVE_REFRESH_MS } from '@/lib/api/list-query';
import { parseLeniently } from '@/lib/search';

export const shiftKeys = { all: ['shifts'] as const, templates: ['shifts', 'templates'] as const };

export const shiftTemplatesQueryOptions = () =>
  queryOptions({
    queryKey: shiftKeys.templates,
    queryFn: async () => (await http.get<{ items: ShiftTemplate[] }>('/shifts/templates')).data.items,
    staleTime: 5 * 60_000,
  });

/**
 * One month, week or day of the plan, keyed by the parsed query like a list,
 * so the page's loader and its calendar share the entry. Without `date` the
 * server answers for today, and a refetch after midnight moves on with it.
 */
export const shiftCalendarQueryOptions = (query: ShiftCalendarQueryInput = {}) => {
  const params = parseLeniently(ShiftCalendarQuerySchema, query);
  return queryOptions({
    queryKey: [...shiftKeys.all, 'calendar', params] as const,
    // No abort `signal` on purpose: see `listQuery`.
    queryFn: async () => (await http.get<ShiftCalendar>('/shifts/calendar', { params })).data,
    // Keep the current period on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
};

export const onDutyQueryOptions = (query: OnDutyQueryInput = {}) => {
  // Parsed, so `role: 'OPERATOR'` and `role: ['OPERATOR']` share one entry.
  const params = parseLeniently(OnDutyQuerySchema, query);
  return queryOptions({
    queryKey: [...shiftKeys.all, 'on-duty', params] as const,
    queryFn: async () => (await http.get<OnDuty>('/shifts/on-duty', { params })).data,
    refetchInterval: LIVE_REFRESH_MS * 2,
  });
};

const refreshShifts = (queryClient: ReturnType<typeof useQueryClient>) =>
  invalidate(queryClient, shiftKeys.all, ['audit-logs']);

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** " (2 had already started and were left as they were)", or nothing. */
const skippedNote = (skipped: number, why: string) => (skipped > 0 ? ` (${plural(skipped, 'shift')} ${why})` : '');

export function useCreateAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateShiftAssignmentInput) =>
      (await http.post<ShiftChangeResult>('/shifts/assignments', input)).data,
    onSuccess: ({ items }) => {
      toast.success(items.length === 1 ? `Scheduled ${items[0].user.name}` : `Scheduled ${items.length} shifts`);
      return refreshShifts(queryClient);
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scope, patch }: { id: string; scope: ShiftScope; patch: UpdateShiftAssignmentInput }) =>
      (await http.patch<ShiftChangeResult>(`/shifts/assignments/${id}`, patch, { params: { scope } })).data,
    onSuccess: ({ items, skipped }) => {
      const what = items.length === 1 ? 'Shift updated' : `Updated ${plural(items.length, 'shift')}`;
      toast.success(what + skippedNote(skipped, 'already started and kept as they were'));
      return refreshShifts(queryClient);
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scope }: { id: string; scope: ShiftScope }) =>
      (await http.delete<ShiftRemoveResult>(`/shifts/assignments/${id}`, { params: { scope } })).data,
    onSuccess: ({ removed, skipped }) => {
      toast.success(`Removed ${plural(removed, 'shift')}` + skippedNote(skipped, 'already started and stayed'));
      return refreshShifts(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useCopyWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CopyShiftWeekInput) =>
      (await http.post<ShiftChangeResult>('/shifts/assignments/copy-week', input)).data,
    onSuccess: ({ items, skipped }) => {
      toast.success(`Copied ${plural(items.length, 'shift')}` + skippedNote(skipped, 'of inactive people or shifts left out'));
      return refreshShifts(queryClient);
    },
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CreateShiftTemplateInput | UpdateShiftTemplateDto }) =>
      (id
        ? await http.patch<ShiftTemplate>(`/shifts/templates/${id}`, input)
        : await http.post<ShiftTemplate>('/shifts/templates', input)
      ).data,
    onSuccess: (template, { id }) => {
      toast.success(id ? `Saved “${template.name}”` : `Created “${template.name}”`);
      return refreshShifts(queryClient);
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: { id: string; name: string }) => {
      await http.delete(`/shifts/templates/${template.id}`);
      return template;
    },
    onSuccess: (template) => {
      toast.success(`Deleted “${template.name}”`);
      return refreshShifts(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
