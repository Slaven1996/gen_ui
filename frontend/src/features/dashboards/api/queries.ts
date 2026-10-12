import { queryOptions } from '@tanstack/react-query';
import type { Dashboard, DashboardDetail } from '@gen-ui/shared';
import { http } from '@/lib/api/http';

export const dashboardKeys = {
  all: ['dashboards'] as const,
  list: ['dashboards', 'list'] as const,
  detail: (id: string) => ['dashboards', 'detail', id] as const,
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
