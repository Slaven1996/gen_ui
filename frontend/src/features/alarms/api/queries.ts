import { queryOptions } from '@tanstack/react-query';
import {
  ListAlarmDefinitionsQuerySchema,
  ListAlarmsQuerySchema,
  type Alarm,
  type AlarmDefinition,
  type Paginated,
} from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { listQuery, LIVE_REFRESH_MS } from '@/lib/api/list-query';

export const alarmKeys = { all: ['alarms'] as const, detail: (id: string) => ['alarms', 'detail', id] as const };
export const definitionKeys = {
  all: ['alarm-definitions'] as const,
  detail: (id: string) => ['alarm-definitions', 'detail', id] as const,
};

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

/** One rule as it is now: what the assistant's edit form opens on. */
export const alarmDefinitionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: definitionKeys.detail(id),
    queryFn: async () => (await http.get<AlarmDefinition>(`/alarm-definitions/${id}`)).data,
  });
