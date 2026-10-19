import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateDashboardInput, DashboardDetail, SaveDashboardInput } from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { dashboardKeys } from './queries';

/** A saved dashboard: its detail as returned, the list, and the drafts (one may now be saved). */
function refreshDashboards(queryClient: QueryClient, dashboard: DashboardDetail) {
  queryClient.setQueryData(dashboardKeys.detail(dashboard.id), dashboard);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: dashboardKeys.list }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.drafts }),
  ]);
}

/** Creates a dashboard with its widgets; `source` when it is an assistant's draft. */
export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDashboardInput) => (await http.post<DashboardDetail>('/dashboards', input)).data,
    onSuccess: (dashboard) => {
      toast.success(`Created “${dashboard.name}”`);
      return refreshDashboards(queryClient, dashboard);
    },
  });
}

/** Saves a whole dashboard: name, sharing and widgets, in one request. */
export function useSaveDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: SaveDashboardInput }) =>
      (await http.put<DashboardDetail>(`/dashboards/${id}`, body)).data,
    onSuccess: (dashboard) => {
      toast.success(`Saved “${dashboard.name}”`);
      return refreshDashboards(queryClient, dashboard);
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
      // A draft it was saved from reads "not created" again.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: dashboardKeys.list }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.drafts }),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
