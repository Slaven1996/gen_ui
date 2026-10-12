import { queryOptions } from '@tanstack/react-query';
import { ListDevicesQuerySchema, type Device, type Paginated } from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { listQuery, LIVE_REFRESH_MS } from '@/lib/api/list-query';

export const deviceKeys = { all: ['devices'] as const };

export const devicesListQueryOptions = listQuery<typeof ListDevicesQuerySchema, Paginated<Device>>(
  'devices',
  '/devices',
  ListDevicesQuerySchema,
  { refetchInterval: LIVE_REFRESH_MS },
);

export const deviceQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...deviceKeys.all, 'detail', id] as const,
    queryFn: async () => (await http.get<Device>(`/devices/${id}`)).data,
  });
