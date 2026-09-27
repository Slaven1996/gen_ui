import type { UIMessage } from 'ai';
import { z } from 'zod';
import { PublicUserSchema, RoleSchema } from './auth.js';

// ─── Requests ───────────────────────────────────────────────────────────────

/** What the current page tells the assistant about itself. */
export const ChatContextSchema = z.object({
  pathname: z.string().max(500),
  title: z.string().max(200).optional(),
  summary: z.string().max(2000).optional(),
});
export type ChatContext = z.infer<typeof ChatContextSchema>;

/** A saved conversation holds at most this many messages; clearing it starts over. */
export const MAX_CONVERSATION_MESSAGES = 200;

/**
 * Envelope for POST /ai/chat. The server keeps the conversation, so a request
 * carries only what is new: the user's message (`submit-message`), or nothing
 * when the last answer should be generated again (`regenerate-message`).
 * `message` is only shape-checked here; the backend validates the whole
 * conversation with the AI SDK's `safeValidateUIMessages` against the tool
 * schemas.
 */
export const ChatRequestSchema = z
  .object({
    id: z.uuid().describe('Conversation id, created by the client; the same for every turn.'),
    trigger: z.enum(['submit-message', 'regenerate-message']),
    message: z
      .unknown()
      .optional()
      .describe('The new user message, as an AI SDK UI message. Required for `submit-message`.'),
    context: ChatContextSchema.optional(),
    generateUi: z
      .boolean()
      .default(true)
      .describe('false: answer in Markdown only; tool results are not rendered as components.'),
  })
  .meta({ id: 'ChatRequest' });
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ConversationSchema = z
  .object({
    id: z.uuid(),
    messages: z.array(z.unknown()).describe('AI SDK UI messages, oldest first, parts included.'),
  })
  .meta({ id: 'Conversation' });

export const LatestConversationSchema = z
  .object({ conversation: ConversationSchema.nullable() })
  .meta({ id: 'LatestConversation' });

/** A saved conversation. The server only stores messages it has validated. */
export interface Conversation {
  id: string;
  messages: GenUIMessage[];
}

export interface LatestConversation {
  conversation: Conversation | null;
}

// ─── Generative UI tools ────────────────────────────────────────────────────

/*
 * Tool contracts. The backend attaches `execute` to these schemas and hands
 * them to the model; the frontend renders each tool call with a component
 * keyed by tool name. Keeping them here keeps both sides type-synced.
 *
 * Everything the model needs to know about a tool lives here too: in its
 * `description` and in each field's `.describe()`, which the model receives
 * with the tool. The system prompt stays generic and never names a tool.
 *
 * Inputs use plain types (no transforms or coercion), so the JSON Schema sent
 * to the model describes exactly what it may send.
 */

/** Apart from `title`, every field is also a `/users` URL param: a call is a page query too. */
export const ListUsersToolInputSchema = z.object({
  title: z.string().max(80).describe("Short caption for this list, e.g. 'Admins' or 'Users named John'."),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of a name or email, case-insensitive. 'users named John' → 'John'; 'gmail addresses' → 'gmail'. Omit to list everyone.",
    ),
  role: RoleSchema.optional().describe('ADMIN for admins or administrators, USER for regular users. Omit for both.'),
  isActive: z
    .boolean()
    .optional()
    .describe('false for deactivated or disabled accounts, true for active ones only. Omit for both.'),
});

export const ListUsersToolOutputSchema = z.object({
  total: z.int().describe('Every match, not only the rows returned.'),
  users: z.array(PublicUserSchema.pick({ name: true, email: true, role: true, isActive: true, lastLoginAt: true })),
});

export const genUiToolSchemas = {
  listUsers: {
    description: "Find this app's user accounts by name or email, role and status.",
    inputSchema: ListUsersToolInputSchema,
    outputSchema: ListUsersToolOutputSchema,
  },
} as const;

type ToolContract = { inputSchema: z.ZodType; outputSchema: z.ZodType };
type ToolIO<T extends ToolContract> = {
  input: z.infer<T['inputSchema']>;
  output: z.infer<T['outputSchema']>;
};

/** `UITools`-compatible map: tool name → { input, output }. */
export type GenUITools = {
  [K in keyof typeof genUiToolSchemas]: ToolIO<(typeof genUiToolSchemas)[K]>;
};
export type GenUIToolName = keyof GenUITools;

/** Per-message metadata streamed on `start` / `finish`, and saved with the message. */
export interface GenUIMetadata {
  model?: string;
  createdAt?: number;
  /** The mode the answer was given in; the chat keeps rendering it that way. */
  generateUi?: boolean;
  /** AI SDK finish reason; `content-filter` means the model refused. */
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';
}

export type GenUIMessage = UIMessage<GenUIMetadata, Record<string, never>, GenUITools>;
