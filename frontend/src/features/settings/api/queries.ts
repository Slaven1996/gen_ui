import { queryOptions } from '@tanstack/react-query';
import type { AssistantInstructions } from '@gen-ui/shared';
import { http } from '@/lib/api/http';

export const settingsKeys = {
  all: ['settings'] as const,
  assistantInstructions: ['settings', 'assistant-instructions'] as const,
};

/** The assistant's standing instructions (admins only). */
export const assistantInstructionsQueryOptions = () =>
  queryOptions({
    queryKey: settingsKeys.assistantInstructions,
    queryFn: async () => (await http.get<AssistantInstructions>('/ai/instructions')).data,
  });
