import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AssistantInstructions, UpdateAssistantInstructionsDto } from '@gen-ui/shared';
import { auditKeys } from '@/features/audit/api/queries';
import { http } from '@/lib/api/http';
import { invalidate } from '@/lib/api/list-query';
import { settingsKeys } from './queries';

export function useSaveAssistantInstructions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateAssistantInstructionsDto) =>
      (await http.put<AssistantInstructions>('/ai/instructions', dto)).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsKeys.assistantInstructions, saved);
      toast.success('Instructions saved');
      return invalidate(queryClient, auditKeys.all);
    },
  });
}
