import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateTagInput, Tag, UpdateTagDto } from '@gen-ui/shared';
import { deviceKeys } from '@/features/devices/api/queries';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { invalidate } from '@/lib/api/list-query';
import { tagKeys } from './queries';

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
