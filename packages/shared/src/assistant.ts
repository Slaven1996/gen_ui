import type { UIMessage } from 'ai';
import { z } from 'zod';
import { PublicUserSchema, RoleSchema } from './auth.js';

// ─── Models ─────────────────────────────────────────────────────────────────

/**
 * The Claude models the chat offers, one per tier. The user picks one in the
 * chat, and the server accepts only these ids. Models with `effort` think
 * adaptively and take an effort level; Claude Haiku 4.5 does neither, and
 * the server sends it neither option.
 */
export const AssistantModelSchema = z.enum(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']);
export type AssistantModel = z.infer<typeof AssistantModelSchema>;

export const ASSISTANT_MODELS: Record<AssistantModel, { label: string; effort: boolean }> = {
  'claude-opus-5': { label: 'Claude Opus 5', effort: true },
  'claude-sonnet-5': { label: 'Claude Sonnet 5', effort: true },
  'claude-haiku-4-5': { label: 'Claude Haiku 4.5', effort: false },
};
export const DEFAULT_ASSISTANT_MODEL: AssistantModel = 'claude-opus-5';

/** How hard the model works on an answer: lower is faster and cheaper. `high` is Anthropic's default. */
export const EffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
export type Effort = z.infer<typeof EffortSchema>;
export const DEFAULT_EFFORT: Effort = 'high';

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
    model: AssistantModelSchema.default(DEFAULT_ASSISTANT_MODEL).describe('The Claude model that answers.'),
    effort: EffortSchema.optional().describe(
      `Effort level, default \`${DEFAULT_EFFORT}\`. Ignored by models without one (Claude Haiku 4.5).`,
    ),
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
 * The only AI-driven part of a tool call is its input: Claude decides whether
 * to call a tool and fills these fields from the user's words. Running the
 * query (backend) and drawing the result (frontend) are ordinary code.
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
  /** The model id that answered (older messages may hold ids no longer offered). */
  model?: string;
  /** The effort level it answered with; absent for models without one. */
  effort?: Effort;
  createdAt?: number;
  /** The mode the answer was given in; the chat keeps rendering it that way. */
  generateUi?: boolean;
  /** AI SDK finish reason; `content-filter` means the model refused. */
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';
}

export type GenUIMessage = UIMessage<GenUIMetadata, Record<string, never>, GenUITools>;
