import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FormOutcomeRequest, FormToolOutput } from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { patchFormOutput, useChatInstance } from '../store/chat-store';

/**
 * Tells the server what the user did with the form, which stores it on the
 * call, then shows the call's new output in the chat.
 */
export function useRecordFormOutcome(toolCallId: string) {
  const chat = useChatInstance();
  return useMutation({
    mutationFn: async (body: FormOutcomeRequest) => {
      if (!chat) throw new Error('The chat is still loading.');
      const url = `/ai/conversations/${chat.id}/forms/${encodeURIComponent(toolCallId)}`;
      return (await http.put<FormToolOutput>(url, body)).data;
    },
    onSuccess: (output) => patchFormOutput(toolCallId, output),
    onError: (error) => toast.error(`The chat couldn't keep this form's result: ${getErrorMessage(error)}`),
  });
}
