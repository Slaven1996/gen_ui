import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ListShiftAssignmentsQuerySchema,
  type CreateShiftAssignmentInput,
  type CreateShiftTemplateInput,
  type OnDuty,
  type OnDutyQueryInput,
  type Paginated,
  type ShiftAssignment,
  type ShiftTemplate,
  type UpdateShiftAssignmentDto,
  type UpdateShiftTemplateDto,
} from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate, listQuery, LIVE_REFRESH_MS } from '@/lib/api/list-query';

export const shiftKeys = { all: ['shifts'] as const, templates: ['shifts', 'templates'] as const };

export const shiftTemplatesQueryOptions = () =>
  queryOptions({
    queryKey: shiftKeys.templates,
    queryFn: async () => (await http.get<{ items: ShiftTemplate[] }>('/shifts/templates')).data.items,
    staleTime: 5 * 60_000,
  });

export const shiftAssignmentsQueryOptions = listQuery<
  typeof ListShiftAssignmentsQuerySchema,
  Paginated<ShiftAssignment>
>('shifts', '/shifts/assignments', ListShiftAssignmentsQuerySchema);

export const onDutyQueryOptions = (query: OnDutyQueryInput = {}) =>
  queryOptions({
    queryKey: [...shiftKeys.all, 'on-duty', query] as const,
    queryFn: async () => (await http.get<OnDuty>('/shifts/on-duty', { params: query })).data,
    refetchInterval: LIVE_REFRESH_MS * 2,
  });

const refreshShifts = (queryClient: ReturnType<typeof useQueryClient>) => invalidate(queryClient, shiftKeys.all);

export function useCreateAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateShiftAssignmentInput) =>
      (await http.post<{ items: ShiftAssignment[] }>('/shifts/assignments', input)).data.items,
    onSuccess: (items) => {
      toast.success(items.length === 1 ? `Scheduled ${items[0].user.name}` : `Scheduled ${items.length} shifts`);
      return refreshShifts(queryClient);
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateShiftAssignmentDto }) =>
      (await http.patch<ShiftAssignment>(`/shifts/assignments/${id}`, patch)).data,
    onSuccess: () => {
      toast.success('Shift updated');
      return refreshShifts(queryClient);
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/shifts/assignments/${id}`);
    },
    onSuccess: () => {
      toast.success('Shift removed');
      return refreshShifts(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
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
