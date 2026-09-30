import type { UIMessage } from 'ai';
import { z } from 'zod';
import { AlarmConditionSchema, AlarmDefinitionSchema, AlarmSeveritySchema } from './alarms.js';
import { PublicUserSchema, RoleSchema } from './auth.js';
import { RelativeRangeSchema, timeZoneParam } from './common/query.js';
import { AuditLogSchema } from './logbook.js';
import { LastSignInFilterSchema, UserStatusSchema } from './users.js';

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
/**
 * The cheapest model: the one the picker starts on, and the one the server
 * uses when a request names none. Lookups like "all admins" don't need more.
 */
export const DEFAULT_ASSISTANT_MODEL: AssistantModel = 'claude-haiku-4-5';

/** How hard the model works on an answer: lower is faster and cheaper. `high` is Anthropic's default. */
export const EffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
export type Effort = z.infer<typeof EffortSchema>;
export const DEFAULT_EFFORT: Effort = 'high';

// ─── Requests ───────────────────────────────────────────────────────────────

/** What the current page tells the assistant about itself, and where the user is. */
export const ChatContextSchema = z.object({
  pathname: z.string().max(500),
  title: z.string().max(200).optional(),
  summary: z.string().max(2000).optional(),
  timeZone: timeZoneParam().describe(
    "The browser's IANA time zone. \"Today\" and any date the user mentions are days there.",
  ),
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
 * to the model describes exactly what it may send. Apart from `title`, every
 * input field is also a URL param of the tool's page, so a call is a page
 * query too, and the chat can link to that page with the same filters.
 */

const titleField = (examples: string) =>
  z.string().max(80).describe(`Short caption for this list, e.g. ${examples}.`);

const TOTAL_DESCRIPTION = 'Every match, not only the rows returned.';

// ─── Users ──────────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also a `/users` URL param. */
export const ListUsersToolInputSchema = z.object({
  title: titleField("'Admins' or 'Users named John'"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of a name or email, case-insensitive. 'users named John' → 'John'; 'gmail addresses' → 'gmail'. Omit to list everyone.",
    ),
  role: RoleSchema.optional().describe('ADMIN for admins or administrators, USER for regular users. Omit for both.'),
  status: UserStatusSchema.optional().describe(
    'DEACTIVATED for deactivated or disabled accounts, ACTIVE for active ones only. Omit for both.',
  ),
  lastSignIn: LastSignInFilterSchema.optional().describe(
    "'never' for accounts that have never signed in. A date (YYYY-MM-DD) for accounts whose last sign-in was on that day: 'signed in today' → today's date, 'last logged in on 3 May' → that date. Omit when sign-ins don't matter.",
  ),
});

export const ListUsersToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  users: z.array(PublicUserSchema.pick({ name: true, email: true, role: true, isActive: true, lastLoginAt: true })),
});

// ─── Alarm rules ────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also an `/alarm-rules` URL param. */
export const ListAlarmRulesToolInputSchema = z.object({
  title: titleField("'Critical rules' or 'Rules at Riverside'"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of a rule's name, of its tag's name or code, or of the name or code of an asset, case-insensitive. An asset matches every rule at it or below it, so a site covers all its equipment. 'rules on the wet well' → 'wet well'; 'rules at Riverside Pumping Station' → 'Riverside'; 'chlorine alarms' → 'chlorine'. Omit to list every rule.",
    ),
  severity: z
    .array(AlarmSeveritySchema)
    .min(1)
    .optional()
    .describe(
      "The severities the rules raise, from most to least severe: CRITICAL, HIGH, MEDIUM, LOW, INFO. 'critical rules' → ['CRITICAL']; 'high or worse' → ['CRITICAL', 'HIGH']. Omit for every severity.",
    ),
  condition: z
    .array(AlarmConditionSchema)
    .min(1)
    .optional()
    .describe(
      "How a rule compares each reading with its threshold: ABOVE for high limits ('high level', 'overpressure'), BELOW for low limits ('low level', 'low pressure'), EQUAL or NOT_EQUAL for on/off signals (a pump fault, a door switch). Omit for every condition.",
    ),
  isEnabled: z
    .boolean()
    .optional()
    .describe('false for disabled (switched off) rules, true for enabled ones only. Omit for both.'),
});

export const ListAlarmRulesToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  rules: z.array(
    AlarmDefinitionSchema.pick({
      name: true,
      condition: true,
      threshold: true,
      deadband: true,
      severity: true,
      isEnabled: true,
      openAlarmCount: true,
    }).extend({
      tag: z.string().describe('The tag (signal) the rule watches.'),
      unit: z.string().nullable().describe('Unit of the threshold and deadband.'),
      asset: z.string().describe('Where that tag is.'),
    }),
  ),
});

// ─── Audit log ──────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also an `/audit` URL param. Admins only. */
export const ListAuditLogsToolInputSchema = z.object({
  title: titleField("'Changes to alarm rules' or 'What Ava did yesterday'"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of the record's summary, which names what was changed, case-insensitive: 'changes to Wet well high level' → 'Wet well high level'; 'anything about PS-01' → 'PS-01'. Not for who acted: use actor. Omit for every record.",
    ),
  action: z
    .string()
    .max(60)
    .optional()
    .describe(
      "What was done: a family ending in '.', or one exact action. Families: auth. (sign-ins), user. (accounts), asset., device., tag., alarm. (acknowledging and clearing alarms), alarm_definition. (alarm rules), logbook., shift_template., shift_assignment. (the shift schedule), dashboard.. An exact action is a family plus a verb: create, update or delete, and also auth.login, user.password_change, asset.move, alarm.acknowledge, alarm.clear, dashboard.widget_add and dashboard.widget_remove. 'changes to alarm rules' → 'alarm_definition.'; 'who acknowledged alarms' → 'alarm.acknowledge'; 'deleted devices' → 'device.delete'; 'sign-ins' → 'auth.login'. Omit for every action.",
    ),
  actor: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of the name or email of the person who acted, case-insensitive: 'what did Ava change' → 'Ava'. Omit for everyone, the system included.",
    ),
  range: RelativeRangeSchema.optional().describe(
    "A window ending now: 'last hour' → 1h, 'last 24 hours' → 24h, 'this past week' or 'recently' → 7d, 'last 30 days' → 30d. For calendar days ('today', 'yesterday', 'since Monday') use from and to instead. Leave it out when you set from or to.",
  ),
  from: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      "Start of the window, inclusive, in ISO 8601 with the session's UTC offset. Calendar days are the user's: 'today' → today at 00:00, 'yesterday' → yesterday at 00:00 (with to = today at 00:00), 'since Monday' → Monday at 00:00. Example: 2026-09-28T00:00:00+02:00.",
    ),
  to: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("End of the window, exclusive, in the same format as from. Omit for 'until now'."),
});

export const ListAuditLogsToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  records: z.array(
    AuditLogSchema.pick({ createdAt: true, action: true, summary: true, changes: true }).extend({
      actor: z.string().nullable().describe('Who acted; null when the system did.'),
    }),
  ),
});

// ─── The tool set ───────────────────────────────────────────────────────────

export const genUiToolSchemas = {
  listUsers: {
    description: "Find this app's user accounts by name or email, role, status and last sign-in.",
    inputSchema: ListUsersToolInputSchema,
    outputSchema: ListUsersToolOutputSchema,
  },
  listAlarmRules: {
    description:
      'Find alarm rules: the thresholds that raise an alarm when a reading of a tag crosses them. Filter by rule, tag or asset name, severity, condition and whether the rule is enabled. Each result says how many of its alarms are still open. It lists rules, not the alarms they raised.',
    inputSchema: ListAlarmRulesToolInputSchema,
    outputSchema: ListAlarmRulesToolOutputSchema,
  },
  listAuditLogs: {
    description:
      'Search the audit log: who changed what and when, newest first. Every create, update, delete, sign-in and alarm acknowledgement in the app is one record. Filter by what was done, who did it, words from the summary and a time window.',
    inputSchema: ListAuditLogsToolInputSchema,
    outputSchema: ListAuditLogsToolOutputSchema,
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
