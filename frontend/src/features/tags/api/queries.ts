import { queryOptions } from '@tanstack/react-query';
import { ListTagsQuerySchema, type Paginated, type Tag } from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { listQuery, LIVE_REFRESH_MS } from '@/lib/api/list-query';

export const tagKeys = { all: ['tags'] as const };

export const tagsListQueryOptions = listQuery<typeof ListTagsQuerySchema, Paginated<Tag>>(
  'tags',
  '/tags',
  ListTagsQuerySchema,
  { refetchInterval: LIVE_REFRESH_MS },
);

export const tagQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...tagKeys.all, 'detail', id] as const,
    queryFn: async () => (await http.get<Tag>(`/tags/${id}`)).data,
  });
