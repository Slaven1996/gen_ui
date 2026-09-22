import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ListAssetsQuerySchema,
  ListDevicesQuerySchema,
  ListTagsQuerySchema,
  type Asset,
  type AssetDetail,
  type AssetTreeNode,
  type CreateAssetInput,
  type CreateDeviceInput,
  type CreateTagInput,
  type Device,
  type Paginated,
  type Tag,
  type UpdateAssetDto,
  type UpdateDeviceDto,
  type UpdateTagDto,
} from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate, listQuery, LIVE_REFRESH_MS } from '@/lib/api/list-query';

export const assetKeys = { all: ['assets'] as const, tree: ['assets', 'tree'] as const };
export const deviceKeys = { all: ['devices'] as const };
export const tagKeys = { all: ['tags'] as const };

// ─── Assets ─────────────────────────────────────────────────────────────────

export const assetsListQueryOptions = listQuery<typeof ListAssetsQuerySchema, Paginated<Asset>>(
  'assets',
  '/assets',
  ListAssetsQuerySchema,
);

export const assetTreeQueryOptions = () =>
  queryOptions({
    queryKey: assetKeys.tree,
    queryFn: async () => (await http.get<{ items: AssetTreeNode[] }>('/assets/tree')).data.items,
    staleTime: 60_000,
  });

export const assetQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...assetKeys.all, 'detail', id] as const,
    queryFn: async () => (await http.get<AssetDetail>(`/assets/${id}`)).data,
  });

/** Any change to the tree: lists, the tree itself and every detail. */
const refreshAssets = (queryClient: ReturnType<typeof useQueryClient>) => invalidate(queryClient, assetKeys.all);

export function useSaveAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CreateAssetInput | UpdateAssetDto }) =>
      (id ? await http.patch<AssetDetail>(`/assets/${id}`, input) : await http.post<AssetDetail>('/assets', input)).data,
    onSuccess: (asset, { id }) => {
      toast.success(id ? `Saved ${asset.name}` : `Added ${asset.name}`);
      return refreshAssets(queryClient);
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (asset: { id: string; name: string }) => {
      await http.delete(`/assets/${asset.id}`);
      return asset;
    },
    onSuccess: (asset) => {
      toast.success(`Deleted ${asset.name}`);
      return refreshAssets(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// ─── Devices ────────────────────────────────────────────────────────────────

export const devicesListQueryOptions = listQuery<typeof ListDevicesQuerySchema, Paginated<Device>>(
  'devices',
  '/devices',
  ListDevicesQuerySchema,
  { refetchInterval: LIVE_REFRESH_MS },
);

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

// ─── Tags ───────────────────────────────────────────────────────────────────

export const tagsListQueryOptions = listQuery<typeof ListTagsQuerySchema, Paginated<Tag>>(
  'tags',
  '/tags',
  ListTagsQuerySchema,
  { refetchInterval: LIVE_REFRESH_MS },
);

export function useSaveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CreateTagInput | UpdateTagDto }) =>
      (id ? await http.patch<Tag>(`/tags/${id}`, input) : await http.post<Tag>('/tags', input)).data,
    onSuccess: (tag, { id }) => {
      toast.success(id ? `Saved ${tag.name}` : `Added ${tag.name}`);
      return invalidate(queryClient, tagKeys.all, deviceKeys.all);
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tag: { id: string; name: string }) => {
      await http.delete(`/tags/${tag.id}`);
      return tag;
    },
    onSuccess: (tag) => {
      toast.success(`Deleted ${tag.name}`);
      return invalidate(queryClient, tagKeys.all, deviceKeys.all);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
