import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateUserInput, PublicUser, UpdateUserDto } from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { usersKeys } from './queries';

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data } = await http.post<PublicUser>('/users', input);
      return data;
    },
    onSuccess: (user) => {
      toast.success(`Added ${user.name}`);
      return queryClient.invalidateQueries({ queryKey: usersKeys.all });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateUserDto }) => {
      const { data } = await http.patch<PublicUser>(`/users/${id}`, patch);
      return data;
    },
    onSuccess: (user) => {
      toast.success(`Updated ${user.name}`);
      return queryClient.invalidateQueries({ queryKey: usersKeys.all });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}
