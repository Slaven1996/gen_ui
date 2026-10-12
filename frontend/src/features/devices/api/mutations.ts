import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateDeviceInput, Device, UpdateDeviceDto } from '@gen-ui/shared';
import { assetKeys } from '@/features/assets/api/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate } from '@/lib/api/list-query';
import { deviceKeys } from './queries';

export function useSaveDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CreateDeviceInput | UpdateDeviceDto }) =>
      (id ? await http.patch<Device>(`/devices/${id}`, input) : await http.post<Device>('/devices', input)).data,
    onSuccess: (device, { id }) => {
      toast.success(id ? `Saved ${device.name}` : `Registered ${device.name}`);
      // Status changes are logged; device counts show on assets and KPIs.
      return invalidate(queryClient, deviceKeys.all, assetKeys.all, ['logbook'], ['analytics']);
    },
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (device: { id: string; name: string }) => {
      await http.delete(`/devices/${device.id}`);
      return device;
    },
    onSuccess: (device) => {
      toast.success(`Deleted ${device.name}`);
      return invalidate(queryClient, deviceKeys.all, assetKeys.all, ['analytics']);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
