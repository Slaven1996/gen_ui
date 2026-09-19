import { z } from 'zod';

/** What the current page tells the assistant about itself. */
export const ChatContextSchema = z.object({
  pathname: z.string().max(500),
  title: z.string().max(200).optional(),
  summary: z.string().max(2000).optional(),
});
export type ChatContext = z.infer<typeof ChatContextSchema>;

/**
 * Envelope for POST /ai/chat. `messages` is only shape-checked here; the
 * backend validates it deeply with the AI SDK's `safeValidateUIMessages`
 * against the Generative UI tool schemas.
 */
export const ChatRequestSchema = z.object({
  id: z.string().min(1).max(100),
  messages: z.array(z.unknown()).min(1).max(200),
  context: ChatContextSchema.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
