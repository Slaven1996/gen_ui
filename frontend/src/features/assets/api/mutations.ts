import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AssetDetail, CreateAssetInput, UpdateAssetDto } from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate } from '@/lib/api/list-query';
import { assetKeys } from './queries';

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
