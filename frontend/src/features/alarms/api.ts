import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ListAlarmDefinitionsQuerySchema,
  ListAlarmsQuerySchema,
  type AcknowledgeResult,
  type Alarm,
  type AlarmDefinition,
  type CreateAlarmDefinitionInput,
  type Paginated,
  type UpdateAlarmDefinitionDto,
} from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate, listQuery, LIVE_REFRESH_MS } from '@/lib/api/list-query';

export const alarmKeys = { all: ['alarms'] as const, detail: (id: string) => ['alarms', 'detail', id] as const };
export const definitionKeys = { all: ['alarm-definitions'] as const };

export const alarmsListQueryOptions = listQuery<typeof ListAlarmsQuerySchema, Paginated<Alarm>>(
  'alarms',
  '/alarms',
  ListAlarmsQuerySchema,
  { refetchInterval: LIVE_REFRESH_MS },
);

export const alarmQueryOptions = (id: string) =>
  queryOptions({
    queryKey: alarmKeys.detail(id),
    queryFn: async () => (await http.get<Alarm>(`/alarms/${id}`)).data,
    refetchInterval: LIVE_REFRESH_MS,
  });

export const alarmDefinitionsListQueryOptions = listQuery<
  typeof ListAlarmDefinitionsQuerySchema,
  Paginated<AlarmDefinition>
>('alarm-definitions', '/alarm-definitions', ListAlarmDefinitionsQuerySchema);

/**
 * An alarm changing state moves counts everywhere: open-alarm badges on the
 * asset tree, KPIs, rule counters, and the logbook entry it writes.
 */
export const refreshAlarmViews = (queryClient: QueryClient) =>
  invalidate(queryClient, alarmKeys.all, definitionKeys.all, ['analytics'], ['logbook'], ['assets', 'tree']);

export function useAcknowledgeAlarms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, note }: { ids: string[]; note?: string }) =>
      (await http.post<AcknowledgeResult>('/alarms/acknowledge', { ids, ...(note && { note }) })).data,
    onSuccess: ({ acknowledged, skipped }) => {
      toast.success(
        `Acknowledged ${acknowledged} ${acknowledged === 1 ? 'alarm' : 'alarms'}${skipped ? ` (${skipped} already done)` : ''}`,
      );
      return refreshAlarmViews(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useClearAlarm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await http.post<Alarm>(`/alarms/${id}/clear`)).data,
    onSuccess: () => {
      toast.success('Alarm cleared');
      return refreshAlarmViews(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useSaveAlarmDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CreateAlarmDefinitionInput | UpdateAlarmDefinitionDto }) =>
      (id
        ? await http.patch<AlarmDefinition>(`/alarm-definitions/${id}`, input)
        : await http.post<AlarmDefinition>('/alarm-definitions', input)
      ).data,
    onSuccess: (definition, { id }) => {
      toast.success(id ? `Saved “${definition.name}”` : `Created “${definition.name}”`);
      return invalidate(queryClient, definitionKeys.all);
    },
  });
}

export function useDeleteAlarmDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (definition: { id: string; name: string }) => {
      await http.delete(`/alarm-definitions/${definition.id}`);
      return definition;
    },
    onSuccess: (definition) => {
      toast.success(`Deleted “${definition.name}”`);
      return invalidate(queryClient, definitionKeys.all);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
