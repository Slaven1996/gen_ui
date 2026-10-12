import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import {
  OnDutyQuerySchema,
  ShiftCalendarQuerySchema,
  type OnDuty,
  type OnDutyQueryInput,
  type ShiftAssignment,
  type ShiftCalendar,
  type ShiftCalendarQueryInput,
  type ShiftTemplate,
} from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { LIVE_REFRESH_MS } from '@/lib/api/list-query';
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

/** One shift, as the assistant's edit form opens on it. */
export const shiftAssignmentQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...shiftKeys.all, 'assignment', id] as const,
    queryFn: async () => (await http.get<ShiftAssignment>(`/shifts/assignments/${id}`)).data,
  });

export const onDutyQueryOptions = (query: OnDutyQueryInput = {}) => {
  // Parsed, so `role: 'OPERATOR'` and `role: ['OPERATOR']` share one entry.
  const params = parseLeniently(OnDutyQuerySchema, query);
  return queryOptions({
    queryKey: [...shiftKeys.all, 'on-duty', params] as const,
    queryFn: async () => (await http.get<OnDuty>('/shifts/on-duty', { params })).data,
    refetchInterval: LIVE_REFRESH_MS * 2,
  });
};
