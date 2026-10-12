import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import {
  AlarmTrendQuerySchema,
  TopAlarmsQuerySchema,
  type AlarmTrend,
  type AlarmTrendQueryInput,
  type AnalyticsSummary,
  type TopAlarmsItem,
  type TopAlarmsQueryInput,
} from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { LIVE_REFRESH_MS } from '@/lib/api/list-query';
import { browserTimeZone, parseLeniently } from '@/lib/search';

export const analyticsKeys = { all: ['analytics'] as const };

export const summaryQueryOptions = (assetId?: string) =>
  queryOptions({
    queryKey: [...analyticsKeys.all, 'summary', assetId ?? null] as const,
    queryFn: async () =>
      (await http.get<AnalyticsSummary>('/analytics/summary', { params: { assetId } })).data,
    refetchInterval: LIVE_REFRESH_MS,
  });

export const alarmTrendQueryOptions = (query: AlarmTrendQueryInput) => {
  const params = parseLeniently(AlarmTrendQuerySchema, { timeZone: browserTimeZone, ...query });
  return queryOptions({
    queryKey: [...analyticsKeys.all, 'alarm-trend', params] as const,
    queryFn: async () => (await http.get<AlarmTrend>('/analytics/alarm-trend', { params })).data,
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS * 2,
  });
};

export const topAlarmsQueryOptions = (query: TopAlarmsQueryInput) => {
  const params = parseLeniently(TopAlarmsQuerySchema, query);
  return queryOptions({
    queryKey: [...analyticsKeys.all, 'top-alarms', params] as const,
    queryFn: async () => (await http.get<{ items: TopAlarmsItem[] }>('/analytics/top-alarms', { params })).data.items,
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS * 2,
  });
};
