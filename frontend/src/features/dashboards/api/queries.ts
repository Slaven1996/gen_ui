import { queryOptions } from '@tanstack/react-query';
import type { Dashboard, DashboardDetail, DashboardDraftResponse } from '@gen-ui/shared';
import { http } from '@/lib/api/http';

export const dashboardKeys = {
  all: ['dashboards'] as const,
  list: ['dashboards', 'list'] as const,
  detail: (id: string) => ['dashboards', 'detail', id] as const,
  drafts: ['dashboards', 'draft'] as const,
  draft: (conversationId: string, toolCallId: string) => ['dashboards', 'draft', conversationId, toolCallId] as const,
};

export const dashboardsQueryOptions = () =>
  queryOptions({
    queryKey: dashboardKeys.list,
    queryFn: async () => (await http.get<{ items: Dashboard[] }>('/dashboards')).data.items,
  });

export const dashboardQueryOptions = (id: string) =>
  queryOptions({
    queryKey: dashboardKeys.detail(id),
    queryFn: async () => (await http.get<DashboardDetail>(`/dashboards/${id}`)).data,
  });

/**
 * A dashboard the assistant put together, and the one saved from it, if any.
 * Always stale, so the chat and an open draft see a save, rename or delete
 * from another tab as soon as the window has focus again.
 */
export const dashboardDraftQueryOptions = (conversationId: string, toolCallId: string) =>
  queryOptions({
    queryKey: dashboardKeys.draft(conversationId, toolCallId),
    queryFn: async () =>
      (
        await http.get<DashboardDraftResponse>(
          `/ai/conversations/${conversationId}/dashboard-drafts/${encodeURIComponent(toolCallId)}`,
        )
      ).data,
    staleTime: 0,
  });
