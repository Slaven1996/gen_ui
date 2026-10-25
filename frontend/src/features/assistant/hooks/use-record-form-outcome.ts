import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FormOutcomeRequest, FormToolOutput } from '@gen-ui/shared';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { patchFormOutput } from '../store/chat-store';

/**
 * Tells the server what the user did with the form, which stores it on the
 * call in that chat, then shows the call's new output in the chat.
 */
export function useRecordFormOutcome(conversationId: string, toolCallId: string) {
  return useMutation({
    mutationFn: async (body: FormOutcomeRequest) => {
      const url = `/ai/conversations/${conversationId}/forms/${encodeURIComponent(toolCallId)}`;
      return (await http.put<FormToolOutput>(url, body)).data;
    },
    onSuccess: (output) => patchFormOutput(conversationId, toolCallId, output),
    onError: (error) => toast.error(`The chat couldn't keep this form's result: ${getErrorMessage(error)}`),
  });
}
