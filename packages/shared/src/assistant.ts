import type { UIMessage } from 'ai';
import { z } from 'zod';
import {
  AlarmConditionSchema,
  AlarmDefinitionSchema,
  AlarmSchema,
  AlarmSeveritySchema,
  AlarmStateSchema,
} from './alarms.js';
import { DeviceProtocolSchema, DeviceSchema, DeviceStatusSchema, TagDataTypeSchema, TagSchema } from './assets.js';
import { PublicUserSchema, RoleSchema } from './auth.js';
import { RelativeRangeSchema, timeZoneParam } from './common/query.js';
import {
  AuditLogSchema,
  LOGBOOK_SOURCES,
  LogbookCategorySchema,
  LogbookEntrySchema,
  LogSeveritySchema,
} from './logbook.js';
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

/**
 * Where the listed things are: the page's `assetId`, the value its asset
 * dropdown sets. Claude takes the id from the asset list in its prompt
 * (the dropdown's own choices), so the page shows that asset selected.
 */
const assetIdField = (things: string) =>
  z
    .guid()
    .optional()
    .describe(
      `The id of the asset the ${things} are at, from the asset list. Match the user's words to an asset's name or code, allowing for typos and partial names: 'hilcrest' → the id of Hillcrest Reservoir; 'at PS-01' → the id of Riverside Pumping Station. The asset covers everything below it: a site all its equipment, a district all its sites. One asset per call. Omit for every asset.`,
    );

/**
 * People, as the page's `authorId` or `actorId`: the values its people
 * dropdown sets, taken from the people list in Claude's prompt.
 */
const peopleField = (description: string) =>
  z.array(z.guid()).min(1).max(50).optional().describe(description);

/**
 * A time window as the page's `range`, or `from` and `to`. Claude works out
 * calendar days from the session's current time and UTC offset.
 */
const timeWindowFields = (things: string) => ({
  range: RelativeRangeSchema.optional().describe(
    `Only ${things} in a window ending now: 'last hour' → 1h, 'last 24 hours' → 24h, 'this past week' or 'recently' → 7d, 'last 30 days' → 30d. For calendar days ('today', 'yesterday', 'since Monday') use from and to instead. Leave it out when you set from or to.`,
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
      "Part of a rule's name, or of its tag's name or code, case-insensitive: 'rules on the wet well level' → 'wet well'; 'chlorine rules' → 'chlorine'. For where the rules are, use assetId. Omit to list every rule.",
    ),
  assetId: assetIdField('rules'),
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
      "Part of the record's summary, which names what was changed, case-insensitive: 'changes to Wet well high level' → 'Wet well high level'; 'anything about PS-01' → 'PS-01'. Not for who acted: use actorId. Omit for every record.",
    ),
  action: z
    .string()
    .max(60)
    .optional()
    .describe(
      "What was done: a family ending in '.', or one exact action. Families: auth. (sign-ins), user. (accounts), asset., device., tag., alarm. (acknowledging and clearing alarms), alarm_definition. (alarm rules), logbook., shift_template., shift_assignment. (the shift schedule), dashboard.. An exact action is a family plus a verb: create, update or delete, and also auth.login, user.password_change, asset.move, alarm.acknowledge, alarm.clear, dashboard.widget_add and dashboard.widget_remove. 'changes to alarm rules' → 'alarm_definition.'; 'who acknowledged alarms' → 'alarm.acknowledge'; 'deleted devices' → 'device.delete'; 'sign-ins' → 'auth.login'. Omit for every action.",
    ),
  actorId: peopleField(
    "The ids of the people who acted, from the people list: 'what did Ava change' → [the id of Ava]. Actions the system took have no person, so omit this to include them. Omit for everyone.",
  ),
  ...timeWindowFields('actions taken'),
});

export const ListAuditLogsToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  records: z.array(
    AuditLogSchema.pick({ createdAt: true, action: true, summary: true, changes: true }).extend({
      actor: z.string().nullable().describe('Who acted; null when the system did.'),
    }),
  ),
});

// ─── Alarms ─────────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also an `/alarms` URL param. */
export const ListAlarmsToolInputSchema = z.object({
  title: titleField("'Open critical alarms' or 'Alarms at Riverside today'"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of the alarm's message, its rule's name or its tag's name, case-insensitive: 'wet well alarms' → 'wet well'; 'chlorine alarms' → 'chlorine'. For where the alarms are, use assetId. Omit for every alarm.",
    ),
  assetId: assetIdField('alarms'),
  state: z
    .array(AlarmStateSchema)
    .min(1)
    .optional()
    .describe(
      "ACTIVE: the condition is present and nobody has acknowledged it. ACKNOWLEDGED: present, acknowledged. CLEARED: gone, not acknowledged yet. CLOSED: gone and acknowledged, nothing left to do. 'open alarms' → ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED']; 'unacknowledged' or 'needing attention' → ['ACTIVE', 'CLEARED']; 'active' or 'still present' → ['ACTIVE', 'ACKNOWLEDGED']; 'closed' or 'resolved' → ['CLOSED']. Omit for every state, the closed ones included.",
    ),
  severity: z
    .array(AlarmSeveritySchema)
    .min(1)
    .optional()
    .describe(
      "From most to least severe: CRITICAL, HIGH, MEDIUM, LOW, INFO. 'critical alarms' → ['CRITICAL']; 'high or worse' → ['CRITICAL', 'HIGH']. Omit for every severity.",
    ),
  ...timeWindowFields('alarms raised'),
});

export const ListAlarmsToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  alarms: z.array(
    AlarmSchema.pick({ severity: true, state: true, raisedAt: true, clearedAt: true }).extend({
      message: z.string().describe('The rule, the tag, its limit and the reading that tripped it.'),
      asset: z.string().describe('Where it was raised.'),
      acknowledgedBy: z.string().nullable().describe('Who acknowledged it; null while nobody has.'),
    }),
  ),
});

// ─── Logbook ────────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also a `/logbook` URL param. */
export const ListLogbookEntriesToolInputSchema = z.object({
  title: titleField("'Maintenance this week' or 'Notes on PS-01'"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "A word or phrase from an entry's title or text, case-insensitive: 'anything about the valve' → 'valve'; 'handovers mentioning chlorine' → 'chlorine'. For where, use assetId; for who wrote it, use authorId. Omit for every entry.",
    ),
  category: z
    .array(LogbookCategorySchema)
    .min(1)
    .optional()
    .describe(
      "The kind of entry. People write NOTE (operator notes), MAINTENANCE (work done on equipment) and SHIFT (shift handovers); the system records ALARM (alarms raised, cleared and acknowledged) and DEVICE (device status changes). 'maintenance records' → ['MAINTENANCE']; 'shift handovers' → ['SHIFT']; 'device events' → ['DEVICE']. Omit for every kind.",
    ),
  severity: z
    .array(LogSeveritySchema)
    .min(1)
    .optional()
    .describe(
      "INFO, WARNING or CRITICAL. 'warnings' → ['WARNING']; 'anything serious' → ['WARNING', 'CRITICAL']. Omit for every severity.",
    ),
  source: z
    .enum(LOGBOOK_SOURCES)
    .optional()
    .describe("'user' for entries people wrote, 'system' for events the app recorded. Omit for both."),
  authorId: peopleField(
    "The ids of the people who wrote the entries, from the people list: 'what did Ava write' → [the id of Ava]. This leaves out the events the system recorded. Omit for everyone.",
  ),
  assetId: assetIdField('entries'),
  ...timeWindowFields('entries that happened'),
});

export const ListLogbookEntriesToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  entries: z.array(
    LogbookEntrySchema.pick({ occurredAt: true, category: true, severity: true, title: true }).extend({
      body: z.string().nullable().describe('The text; long ones are cut short.'),
      asset: z.string().nullable(),
      author: z.string().nullable().describe('Who wrote it; null for events the system recorded.'),
    }),
  ),
});

// ─── Devices ────────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also a `/devices` URL param. */
export const ListDevicesToolInputSchema = z.object({
  title: titleField("'Offline devices' or 'Devices at Riverside'"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of a device's name, serial number, model or manufacturer, case-insensitive: 'the RTUs' → 'RTU'; 'serial PLC-RES01-001' → 'PLC-RES01-001'. For where the devices are, use assetId. Omit for every device.",
    ),
  assetId: assetIdField('devices'),
  status: z
    .array(DeviceStatusSchema)
    .min(1)
    .optional()
    .describe(
      "ONLINE: reporting. OFFLINE: stopped reporting. MAINTENANCE: taken out of service for work. FAULT: reporting a fault. 'offline devices' → ['OFFLINE']; 'devices with problems' or 'not working' → ['OFFLINE', 'FAULT']. Omit for every status.",
    ),
  protocol: z
    .array(DeviceProtocolSchema)
    .min(1)
    .optional()
    .describe(
      "How the device talks to the app: MODBUS_TCP, OPC_UA, MQTT, IEC_104, DNP3 or OTHER. 'Modbus devices' → ['MODBUS_TCP']. Omit for every protocol.",
    ),
});

export const ListDevicesToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  devices: z.array(
    DeviceSchema.pick({
      name: true,
      serialNumber: true,
      model: true,
      manufacturer: true,
      protocol: true,
      status: true,
      tagCount: true,
    }).extend({
      asset: z.string().describe('Where it is installed.'),
      lastSeenAt: z.iso.datetime().nullable().describe('When it last sent a reading.'),
    }),
  ),
});

// ─── Tags ───────────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also a `/tags` URL param. */
export const ListTagsToolInputSchema = z.object({
  title: titleField("'Pressure readings' or 'Tags at Hillcrest Reservoir'"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of a tag's name, code or unit, case-insensitive: 'pressures' → 'pressure'; 'the wet well level' → 'wet well'; 'readings in bar' → 'bar'. For where the tags are, use assetId. Omit for every tag.",
    ),
  assetId: assetIdField('tags'),
  dataType: z
    .array(TagDataTypeSchema)
    .min(1)
    .optional()
    .describe(
      'ANALOG for measurements (levels, pressures, flows), DIGITAL for on/off signals (running, fault, door open), COUNTER for running totals (energy). Omit for every type.',
    ),
});

export const ListTagsToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  tags: z.array(
    TagSchema.pick({
      name: true,
      code: true,
      unit: true,
      dataType: true,
      minValue: true,
      maxValue: true,
      lastValueAt: true,
    }).extend({
      lastValue: z
        .number()
        .nullable()
        .describe('The latest reading; for DIGITAL tags 1 is on and 0 is off. null before the first one.'),
      device: z.string().describe('The device that reports it.'),
      asset: z.string().describe('Where that device is installed.'),
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
  listAlarms: {
    description:
      "Find alarms, newest first. An alarm is raised when a reading crosses an alarm rule's threshold, and stays open until its condition is gone and someone has acknowledged it. Filter by words from the alarm, asset, state, severity and when it was raised. It lists alarms, not the rules that raise them.",
    inputSchema: ListAlarmsToolInputSchema,
    outputSchema: ListAlarmsToolOutputSchema,
  },
  listLogbookEntries: {
    description:
      "Search the operator logbook, newest first: notes, maintenance work and shift handovers people wrote, and the events the system recorded (alarms raised, cleared and acknowledged; device status changes). Filter by words, kind, severity, source, author, asset and when it happened. It records what happened on site, not who changed the app's records or settings.",
    inputSchema: ListLogbookEntriesToolInputSchema,
    outputSchema: ListLogbookEntriesToolOutputSchema,
  },
  listDevices: {
    description:
      'Find devices: the RTUs, PLCs, drives, analysers and sensors that report readings, with their status, where they are installed and when each last reported. Filter by name, serial number, model or manufacturer, asset, status and protocol.',
    inputSchema: ListDevicesToolInputSchema,
    outputSchema: ListDevicesToolOutputSchema,
  },
  listTags: {
    description:
      "Find tags: the datapoints devices report (a level, a pressure, a pump's running state), each with its latest reading. Use it for current values, e.g. 'what is the wet well level now'. Filter by name, code or unit, asset and type.",
    inputSchema: ListTagsToolInputSchema,
    outputSchema: ListTagsToolOutputSchema,
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
