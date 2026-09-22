import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CreateDashboardInput,
  CreateWidgetInput,
  Dashboard,
  DashboardDetail,
  DashboardWidget,
  UpdateDashboardDto,
  UpdateLayoutDto,
  UpdateWidgetDto,
} from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
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

export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDashboardInput) => (await http.post<DashboardDetail>('/dashboards', input)).data,
    onSuccess: (dashboard) => {
      toast.success(`Created “${dashboard.name}”`);
      queryClient.setQueryData(dashboardKeys.detail(dashboard.id), dashboard);
      return queryClient.invalidateQueries({ queryKey: dashboardKeys.list });
    },
  });
}

export function useUpdateDashboard(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateDashboardDto) => (await http.patch<DashboardDetail>(`/dashboards/${id}`, patch)).data,
    onSuccess: (dashboard) => {
      queryClient.setQueryData(dashboardKeys.detail(id), dashboard);
      return queryClient.invalidateQueries({ queryKey: dashboardKeys.list });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dashboard: { id: string; name: string }) => {
      await http.delete(`/dashboards/${dashboard.id}`);
      return dashboard;
    },
    onSuccess: (dashboard) => {
      toast.success(`Deleted “${dashboard.name}”`);
      queryClient.removeQueries({ queryKey: dashboardKeys.detail(dashboard.id) });
      return queryClient.invalidateQueries({ queryKey: dashboardKeys.list });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useAddWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWidgetInput) =>
      (await http.post<DashboardWidget>(`/dashboards/${dashboardId}/widgets`, input)).data,
    onSuccess: (widget) => {
      toast.success(`Added “${widget.title}”`);
      return queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useUpdateWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ widgetId, patch }: { widgetId: string; patch: UpdateWidgetDto }) =>
      (await http.patch<DashboardWidget>(`/dashboards/${dashboardId}/widgets/${widgetId}`, patch)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dashboardKeys.detail(dashboardId) }),
  });
}

export function useRemoveWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (widgetId: string) => {
      await http.delete(`/dashboards/${dashboardId}/widgets/${widgetId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

/** Optimistic: the grid moves at once and snaps back if the save fails. */
export function useUpdateLayout(dashboardId: string) {
  const queryClient = useQueryClient();
  const key = dashboardKeys.detail(dashboardId);
  return useMutation({
    mutationFn: async (layout: UpdateLayoutDto) =>
      (await http.put<DashboardDetail>(`/dashboards/${dashboardId}/layout`, layout)).data,
    onMutate: async (layout) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DashboardDetail>(key);
      if (previous) {
        const byId = new Map(layout.widgets.map((widget) => [widget.id, widget]));
        queryClient.setQueryData<DashboardDetail>(key, {
          ...previous,
          widgets: previous.widgets
            .map((widget) => ({ ...widget, ...byId.get(widget.id) }) as DashboardWidget)
            .sort((a, b) => a.position - b.position),
        });
      }
      return { previous };
    },
    onError: (error, _layout, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(getErrorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
