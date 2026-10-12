import { queryOptions } from '@tanstack/react-query';
import { ListAssetsQuerySchema, type Asset, type AssetDetail, type AssetTreeNode, type Paginated } from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { listQuery } from '@/lib/api/list-query';

export const assetKeys = { all: ['assets'] as const, tree: ['assets', 'tree'] as const };

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
