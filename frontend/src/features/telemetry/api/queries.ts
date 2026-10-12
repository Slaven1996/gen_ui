import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import {
  TelemetrySeriesQuerySchema,
  TelemetryStatsQuerySchema,
  type TagStats,
  type TelemetrySeries,
  type TelemetrySeriesQueryInput,
  type TelemetryStatsQueryInput,
} from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { LIVE_REFRESH_MS } from '@/lib/api/list-query';
import { browserTimeZone, parseLeniently } from '@/lib/search';

export const telemetryKeys = { all: ['telemetry'] as const };

/** Day buckets follow the viewer's time zone unless the query says otherwise. */
export const seriesQueryOptions = (query: TelemetrySeriesQueryInput) => {
  const params = parseLeniently(TelemetrySeriesQuerySchema, { timeZone: browserTimeZone, ...query });
  return queryOptions({
    queryKey: [...telemetryKeys.all, 'series', params] as const,
    queryFn: async () => (await http.get<TelemetrySeries>('/telemetry/series', { params })).data,
    enabled: (params.tagIds?.length ?? 0) > 0,
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS * 2,
  });
};

export const statsQueryOptions = (query: TelemetryStatsQueryInput) => {
  const params = parseLeniently(TelemetryStatsQuerySchema, query);
  return queryOptions({
    queryKey: [...telemetryKeys.all, 'stats', params] as const,
    queryFn: async () => (await http.get<{ items: TagStats[] }>('/telemetry/stats', { params })).data.items,
    enabled: (params.tagIds?.length ?? 0) > 0,
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS * 2,
  });
};
