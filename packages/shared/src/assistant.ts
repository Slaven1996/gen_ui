import type { ToolUIPart, UIMessage } from 'ai';
import { z } from 'zod';
import {
  AlarmConditionSchema,
  AlarmDefinitionSchema,
  AlarmSchema,
  AlarmSeveritySchema,
  AlarmStateSchema,
} from './alarms.js';
import {
  AssetSchema,
  AssetTypeSchema,
  DeviceProtocolSchema,
  DeviceSchema,
  DeviceStatusSchema,
  TagDataTypeSchema,
  TagSchema,
} from './assets.js';
import { PublicUserSchema, RoleSchema } from './auth.js';
import { RelativeRangeSchema, timeZoneParam } from './common/query.js';
import {
  AuditLogSchema,
  LOGBOOK_SOURCES,
  LogbookCategorySchema,
  LogbookEntrySchema,
  LogSeveritySchema,
  UserLogbookCategorySchema,
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
    timeZone: timeZoneParam().describe(
      "The browser's IANA time zone, default `UTC`. \"Today\" and any date the user mentions are days there.",
    ),
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

// ─── Assets ─────────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also an `/assets` URL param. */
export const ListAssetsToolInputSchema = z.object({
  title: titleField("'Pumping stations' or 'Everything at Riverside'"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Part of an asset's name or code, case-insensitive, for a kind of asset: 'the pumps' → 'pump'; 'reservoirs' → 'reservoir'; 'codes starting PS' → 'PS'. To list what is at or under a named asset, use ancestorId or parentId instead. Omit for every asset.",
    ),
  type: z
    .array(AssetTypeSchema)
    .min(1)
    .optional()
    .describe(
      "The tree's levels, from coarse to fine: REGION (a district or supply zone), SITE (a pumping station, reservoir, monitoring station), AREA (part of a site, e.g. a pump hall), EQUIPMENT (a pump, a tank). 'all sites' → ['SITE']; 'districts' → ['REGION']; 'equipment' → ['EQUIPMENT']. Omit for every level.",
    ),
  ancestorId: z
    .guid()
    .optional()
    .describe(
      "The id of an asset from the asset list, to list it together with everything below it at any depth: 'everything at Riverside' → the id of Riverside Pumping Station; 'sites in the North District' → its id, with type ['SITE']. One asset per call. Omit for the whole tree.",
    ),
  parentId: z
    .guid()
    .optional()
    .describe(
      "The id of an asset from the asset list, to list only the assets directly under it, one level down: 'what is directly under the South District' → its id. Use ancestorId instead for everything below. Omit unless the user asks for direct children.",
    ),
  isActive: z
    .boolean()
    .optional()
    .describe('false for assets taken out of service, true for those in service only. Omit for both.'),
});

export const ListAssetsToolOutputSchema = z.object({
  total: z.int().describe(TOTAL_DESCRIPTION),
  assets: z.array(
    AssetSchema.pick({
      name: true,
      code: true,
      type: true,
      isActive: true,
      address: true,
      childCount: true,
      deviceCount: true,
    }).extend({
      description: z.string().nullable().describe('What the asset is; long ones are cut short.'),
      parent: z.string().nullable().describe('The asset it sits under; null at the top of the tree.'),
      openAlarmCount: z.int().describe('Open alarms on this asset and everything below it.'),
    }),
  ),
});

// ─── Forms ──────────────────────────────────────────────────────────────────

/*
 * Form tools open one of the app's own forms inside the answer, pre-filled
 * from the user's words, for the user to check and save. They never save:
 * `execute` only checks what Claude filled in and returns `opened`. The user
 * saves through the page's REST endpoint, exactly as from the modal, and the
 * browser then reports what happened (PUT /ai/conversations/:id/forms/:toolCallId).
 * The server adds that to the tool's output as `outcome`, so a reloaded chat
 * shows the result instead of the form, and Claude reads it on its next turn.
 *
 * Unlike the list tools, a form tool has no `title` (the form has its own),
 * and its fields are the form's values, not a page's URL params.
 */

export const FORM_TOOL_NAMES = [
  'createUser',
  'createAlarmRule',
  'editAlarmRule',
  'createDevice',
  'editDevice',
  'createTag',
  'editTag',
  'createAsset',
  'editAsset',
  'createLogbookEntry',
  'editLogbookEntry',
] as const;
export type FormToolName = (typeof FORM_TOOL_NAMES)[number];

export const isFormToolName = (name: string): name is FormToolName =>
  (FORM_TOOL_NAMES as readonly string[]).includes(name);

/**
 * Each form's title, as on its dialog. The chat labels the form with it, and
 * with components off, Claude names the forms it could open with them on.
 */
export const FORM_TITLES = {
  createUser: 'Add user',
  createAlarmRule: 'New alarm rule',
  editAlarmRule: 'Edit alarm rule',
  createDevice: 'Register a device',
  editDevice: 'Edit device',
  createTag: 'New tag',
  editTag: 'Edit tag',
  createAsset: 'New asset',
  editAsset: 'Edit asset',
  createLogbookEntry: 'Write in the logbook',
  editLogbookEntry: 'Edit logbook entry',
} as const satisfies Record<FormToolName, string>;

const OPENED_DESCRIPTION = 'The form is open in the chat, pre-filled. Nothing is saved until the user saves it.';
const OUTCOME_DESCRIPTION =
  'What the user did with the form: saved it, or closed it without saving. Missing while it is still open.';

const FormClosedSchema = z.object({ status: z.literal('closed') });

/** An edit's saved outcome: what the user changed, measured from the record as the form opened on it. */
const EditSavedSchema = z.object({
  status: z.literal('saved'),
  changed: z
    .record(z.string(), z.object({ from: z.unknown(), to: z.unknown() }))
    .nullable()
    .describe('Each value the user changed, from → to; null when they saved it unchanged.'),
});

// ─── Forms: users ───────────────────────────────────────────────────────────

/** The Add user form's values, except the password: the admin types that into the form. */
export const CreateUserToolInputSchema = z.object({
  name: z
    .string()
    .max(100)
    .optional()
    .describe("The new user's full name as the user wrote it: 'add Milan Milanović' → 'Milan Milanović'. Omit if not given."),
  email: z
    .email()
    .max(254)
    .optional()
    .describe('Their email address, only if the user gave one. Never make one up.'),
  role: RoleSchema.optional().describe(
    'ADMIN for an admin or administrator, USER for a regular user. Omit if not said: the form starts on USER.',
  ),
});

export const CreateUserToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        user: PublicUserSchema.pick({ name: true, email: true, role: true }).describe('The account that was added.'),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

// ─── Forms: alarm rules ─────────────────────────────────────────────────────

/** An alarm rule's editable values, each optional: only what the user said. */
const RulePrefillSchema = z
  .object({
    name: z.string().max(120).describe("The rule's name, e.g. 'Wet well high level'."),
    description: z.string().max(500).describe('What an operator should know or do when the rule fires.'),
    condition: AlarmConditionSchema.describe(
      "How each reading is compared with the threshold: ABOVE for high limits ('high level', 'overpressure'), BELOW for low limits ('low level', 'low pressure'), EQUAL or NOT_EQUAL for on/off signals (a pump fault, a door switch).",
    ),
    threshold: z.number().describe('The limit, in the unit of the tag.'),
    deadband: z
      .number()
      .min(0)
      .describe('How far the value must come back past the threshold before the alarm clears. Zero or more.'),
    severity: AlarmSeveritySchema.describe('The severity of the alarms it raises: CRITICAL, HIGH, MEDIUM, LOW or INFO.'),
    isEnabled: z.boolean().describe('false to keep the rule switched off.'),
  })
  .partial();
export type RulePrefill = z.infer<typeof RulePrefillSchema>;

export const CreateAlarmRuleToolInputSchema = z.object({
  tagId: z
    .guid()
    .optional()
    .describe(
      "The id of the tag (signal) the rule watches, from the tag list. Match the user's words to a tag's name, code or asset, allowing for typos and partial names: 'the wet well level at Riverside' → that tag's id. Omit if the user didn't say: they pick it in the form.",
    ),
  ...RulePrefillSchema.shape,
});

export const CreateAlarmRuleToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  tag: z
    .object({ name: z.string(), code: z.string(), unit: z.string().nullable(), asset: z.string() })
    .nullable()
    .describe('The tag chosen in the form; null when the user picks it there.'),
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        rule: z
          .object({ name: z.string(), tag: z.string(), asset: z.string() })
          .describe('The rule that was created, with its tag and where that tag is.'),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

export const EditAlarmRuleToolInputSchema = z.object({
  ruleId: z
    .guid()
    .describe(
      "The id of the rule to edit, from the alarm rule list. Match the user's words to a rule's name, its tag or its asset, allowing for typos, partial names and words in Serbian: 'wet wel hihg levl' → the id of Wet well high level. If the user gave an id, use it.",
    ),
  changes: RulePrefillSchema.optional().describe(
    "Only the values the user asked to change: 'raise the threshold to 5' → { threshold: 5 }. The form shows everything else as it is now. Omit to just open the rule.",
  ),
});

/** The rule as it was when the form opened: what Claude reads, and what `changed` is measured from. */
export const RuleSnapshotSchema = AlarmDefinitionSchema.pick({
  name: true,
  description: true,
  condition: true,
  threshold: true,
  deadband: true,
  severity: true,
  isEnabled: true,
}).extend({
  tag: z.string().describe('The tag (signal) the rule watches. It cannot be changed.'),
  unit: z.string().nullable().describe('Unit of the threshold and deadband.'),
  asset: z.string().describe('Where that tag is.'),
});
export type RuleSnapshot = z.infer<typeof RuleSnapshotSchema>;

export const EditAlarmRuleToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  rule: RuleSnapshotSchema.describe('The rule as it was when the form opened.'),
  outcome: z.discriminatedUnion('status', [EditSavedSchema, FormClosedSchema]).optional().describe(OUTCOME_DESCRIPTION),
});

// ─── Forms: devices ─────────────────────────────────────────────────────────

/** A device's editable values, each optional: only what the user said. */
const DevicePrefillSchema = z
  .object({
    assetId: z
      .guid()
      .describe(
        "The id of the asset it is installed on, from the asset list. Match the user's words to an asset's name or code, allowing for typos: 'at Hilcrest' → the id of Hillcrest Reservoir. In an edit, only to move the device.",
      ),
    name: z.string().max(120).describe("The device's name, e.g. 'PS-03 RTU'."),
    serialNumber: z.string().max(80).describe('Its serial number, only if the user gave it. Never make one up.'),
    model: z.string().max(120).describe("Its model, e.g. 'RTU-560'."),
    manufacturer: z.string().max(120).describe("Who makes it, e.g. 'Nordtel'."),
    protocol: DeviceProtocolSchema.describe('How it talks to the system: MODBUS_TCP, OPC_UA, MQTT, IEC_104, DNP3 or OTHER.'),
    status: DeviceStatusSchema.describe(
      "ONLINE, OFFLINE, MAINTENANCE or FAULT. Only if the user said: 'put it into maintenance' → MAINTENANCE. A new device starts OFFLINE.",
    ),
    firmwareVersion: z.string().max(40).describe("Its firmware version, e.g. '4.2.1'."),
    ipAddress: z
      .union([z.ipv4(), z.ipv6()])
      .describe('Its IP address, only if the user gave one. Never make one up.'),
    installedAt: z.iso.date().describe('The day it was installed, YYYY-MM-DD.'),
  })
  .partial();
export type DevicePrefill = z.infer<typeof DevicePrefillSchema>;

export const CreateDeviceToolInputSchema = DevicePrefillSchema;

export const CreateDeviceToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  asset: z.string().nullable().describe('The asset chosen in the form; null when the user picks it there.'),
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        device: z
          .object({ name: z.string(), serialNumber: z.string(), asset: z.string() })
          .describe('The device that was registered, and where it is installed.'),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

export const EditDeviceToolInputSchema = z.object({
  deviceId: z
    .guid()
    .describe(
      "The id of the device to edit, from the device list. Match the user's words to a device's name, serial number or asset, allowing for typos, partial names and words in Serbian: 'the riverside rtu' → the id of PS-01 RTU. If the user gave an id, use it.",
    ),
  changes: DevicePrefillSchema.optional().describe(
    "Only the values the user asked to change: 'put the PS-02 RTU into maintenance' → { status: 'MAINTENANCE' }. The form shows everything else as it is now. Omit to just open the device.",
  ),
});

/** The device as it was when the form opened: what Claude reads, and what `changed` is measured from. */
export const DeviceSnapshotSchema = DeviceSchema.pick({
  name: true,
  serialNumber: true,
  model: true,
  manufacturer: true,
  protocol: true,
  status: true,
  firmwareVersion: true,
  ipAddress: true,
}).extend({
  installedAt: z.string().nullable().describe('The day it was installed, YYYY-MM-DD.'),
  asset: z.string().describe('The asset it is installed on.'),
});
export type DeviceSnapshot = z.infer<typeof DeviceSnapshotSchema>;

export const EditDeviceToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  device: DeviceSnapshotSchema.describe('The device as it was when the form opened.'),
  outcome: z.discriminatedUnion('status', [EditSavedSchema, FormClosedSchema]).optional().describe(OUTCOME_DESCRIPTION),
});

// ─── Forms: tags ────────────────────────────────────────────────────────────

/** A tag's editable values, each optional: only what the user said. A tag's device is fixed. */
const TagPrefillSchema = z
  .object({
    name: z.string().max(120).describe("The tag's name, e.g. 'Outlet pressure'."),
    code: z
      .string()
      .max(60)
      .regex(/^[A-Za-z0-9._-]+$/)
      .describe(
        "Its code, unique on the device: letters, digits, dot, dash or underscore, e.g. 'PS01.OUTLET_PRESSURE'. Only if the user gave one.",
      ),
    description: z.string().max(500).describe('What the tag measures, in a sentence.'),
    unit: z.string().max(20).describe("The unit of its readings, e.g. 'bar', 'm³/h', '%'."),
    dataType: TagDataTypeSchema.describe(
      'ANALOG for a measured value (a level, a pressure, a flow), DIGITAL for an on/off state (a pump running, a door open), COUNTER for a running total (energy, volume).',
    ),
    minValue: z.number().describe('The bottom of its range, which scales chart axes and gauges.'),
    maxValue: z.number().describe('The top of its range; above the minimum.'),
    logIntervalSeconds: z.int().min(1).max(86_400).describe('How often a reading is logged, in seconds: 1 to 86400.'),
    isActive: z.boolean().describe('false to keep the tag switched off.'),
  })
  .partial();
export type TagPrefill = z.infer<typeof TagPrefillSchema>;

export const CreateTagToolInputSchema = z.object({
  deviceId: z
    .guid()
    .optional()
    .describe(
      "The id of the device that reports the tag, from the device list. Match the user's words to a device's name, serial number or asset, allowing for typos: 'on the reservoir PLC' → the id of Reservoir PLC. Omit if the user didn't say: they pick it in the form.",
    ),
  ...TagPrefillSchema.shape,
});

export const CreateTagToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  device: z
    .object({ name: z.string(), asset: z.string() })
    .nullable()
    .describe('The device chosen in the form, and where it is; null when the user picks it there.'),
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        tag: z
          .object({ name: z.string(), code: z.string(), device: z.string(), asset: z.string() })
          .describe('The tag that was added, its device and where that device is.'),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

export const EditTagToolInputSchema = z.object({
  tagId: z
    .guid()
    .describe(
      "The id of the tag to edit, from the tag list. Match the user's words to a tag's name, code or asset, allowing for typos, partial names and words in Serbian: 'inlet presure at riverside' → the id of that Inlet pressure. If the user gave an id, use it.",
    ),
  changes: TagPrefillSchema.optional().describe(
    "Only the values the user asked to change: 'log the inlet pressure every 30 seconds' → { logIntervalSeconds: 30 }. The form shows everything else as it is now. Omit to just open the tag.",
  ),
});

/** The tag as it was when the form opened: what Claude reads, and what `changed` is measured from. */
export const TagSnapshotSchema = TagSchema.pick({
  name: true,
  code: true,
  description: true,
  unit: true,
  dataType: true,
  minValue: true,
  maxValue: true,
  logIntervalSeconds: true,
  isActive: true,
}).extend({
  device: z.string().describe('The device that reports it. It cannot be changed.'),
  asset: z.string().describe('Where that device is.'),
});
export type TagSnapshot = z.infer<typeof TagSnapshotSchema>;

export const EditTagToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  tag: TagSnapshotSchema.describe('The tag as it was when the form opened.'),
  outcome: z.discriminatedUnion('status', [EditSavedSchema, FormClosedSchema]).optional().describe(OUTCOME_DESCRIPTION),
});

// ─── Forms: assets ──────────────────────────────────────────────────────────

/** An asset's editable values, each optional: only what the user said. */
const AssetPrefillSchema = z
  .object({
    parentId: z
      .guid()
      .nullable()
      .describe(
        "The id of the asset it sits under, from the asset list. Match the user's words to an asset's name or code, allowing for typos: 'under the pump hall at Riverside' → the id of Pump hall. null for the top of the tree. In an edit, only to move it: everything below it moves along.",
      ),
    name: z.string().max(120).describe("The asset's name, e.g. 'Pump 3'."),
    code: z
      .string()
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/)
      .describe(
        "Its code, unique across the tree: letters, digits, dot, dash or underscore, e.g. 'PS-01-P3'. Only if the user gave one.",
      ),
    type: AssetTypeSchema.describe(
      "Its level in the tree: REGION (a district or supply zone), SITE (a pumping station, reservoir, monitoring station), AREA (part of a site, e.g. a pump hall), EQUIPMENT (a pump, a tank). Omit if unclear: a new asset starts as SITE at the top and EQUIPMENT under a parent.",
    ),
    description: z.string().max(1000).describe('What the asset is, in a sentence.'),
    address: z.string().max(300).describe('Its street address, only if the user gave one.'),
    latitude: z.number().min(-90).max(90).describe('Its latitude, only if the user gave it.'),
    longitude: z.number().min(-180).max(180).describe('Its longitude, only if the user gave it.'),
    isActive: z.boolean().describe('false for an asset taken out of service.'),
  })
  .partial();
export type AssetPrefill = z.infer<typeof AssetPrefillSchema>;

export const CreateAssetToolInputSchema = AssetPrefillSchema;

export const CreateAssetToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  parent: z
    .string()
    .nullable()
    .describe('The asset it goes under; null at the top of the tree, or when the user picks it there.'),
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        asset: z
          .object({ name: z.string(), code: z.string(), type: AssetTypeSchema, parent: z.string().nullable() })
          .describe('The asset that was created, and the one it sits under (null at the top of the tree).'),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

export const EditAssetToolInputSchema = z.object({
  assetId: z
    .guid()
    .describe(
      "The id of the asset to edit, from the asset list. Match the user's words to an asset's name or code, allowing for typos, partial names and words in Serbian: 'rezervoar hilkrest' → the id of Hillcrest Reservoir. If the user gave an id, use it.",
    ),
  changes: AssetPrefillSchema.optional().describe(
    "Only the values the user asked to change: 'take pump 2 at Riverside out of service' → { isActive: false }. The form shows everything else as it is now. Omit to just open the asset.",
  ),
});

/** The asset as it was when the form opened: what Claude reads, and what `changed` is measured from. */
export const AssetSnapshotSchema = AssetSchema.pick({
  name: true,
  code: true,
  type: true,
  description: true,
  address: true,
  latitude: true,
  longitude: true,
  isActive: true,
}).extend({
  parent: z.string().nullable().describe('The asset it sits under; null at the top of the tree.'),
});
export type AssetSnapshot = z.infer<typeof AssetSnapshotSchema>;

export const EditAssetToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  asset: AssetSnapshotSchema.describe('The asset as it was when the form opened.'),
  outcome: z.discriminatedUnion('status', [EditSavedSchema, FormClosedSchema]).optional().describe(OUTCOME_DESCRIPTION),
});

// ─── Forms: logbook ─────────────────────────────────────────────────────────

/** A logbook entry's values, each optional: only what the user said. */
const EntryPrefillSchema = z
  .object({
    category: UserLogbookCategorySchema.describe(
      "The kind of entry: NOTE (an operator note), MAINTENANCE (work done on equipment) or SHIFT (a shift handover). 'log that I replaced the pump seal' → MAINTENANCE. Omit if unclear: a new entry starts as NOTE.",
    ),
    severity: LogSeveritySchema.describe(
      "INFO, WARNING or CRITICAL: how much it matters to whoever reads it next. Omit if the user didn't say: a new entry starts as INFO.",
    ),
    title: z
      .string()
      .max(200)
      .describe("A short headline, from the user's own words: 'log that I replaced the seal on pump 2' → 'Pump 2 seal replaced'."),
    body: z
      .string()
      .max(5000)
      .describe("The details, in the user's own words. Never add facts, readings or times they didn't give."),
    assetId: z
      .guid()
      .nullable()
      .describe(
        "The id of the asset the entry is about, from the asset list. Match the user's words to an asset's name or code, allowing for typos: 'at Hilcrest' → the id of Hillcrest Reservoir. null for no asset.",
      ),
    occurredAt: z.iso
      .datetime({ offset: true })
      .describe(
        "When it happened, in ISO 8601 with the session's UTC offset, only if the user said: 'at 6 this morning' → today at 06:00. A new entry without it happened now.",
      ),
  })
  .partial();
export type EntryPrefill = z.infer<typeof EntryPrefillSchema>;

export const CreateLogbookEntryToolInputSchema = EntryPrefillSchema;

export const CreateLogbookEntryToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  asset: z
    .string()
    .nullable()
    .describe('The asset the entry is about; null for none, or when the user picks it there.'),
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        entry: LogbookEntrySchema.pick({ category: true, title: true, occurredAt: true })
          .extend({ asset: z.string().nullable() })
          .describe('The entry that was written: its kind, title, when it happened and the asset it is about.'),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

export const EditLogbookEntryToolInputSchema = z.object({
  entryId: z
    .guid()
    .describe(
      "The id of the entry to edit, from the list of the user's own entries. Match the user's words to an entry's title, kind, time or asset, allowing for typos and words in Serbian: 'my handover from this morning' → the id of that SHIFT entry. If the user gave an id, use it.",
    ),
  changes: EntryPrefillSchema.optional().describe(
    "Only the values the user asked to change: 'mark my tank 1 note as critical' → { severity: 'CRITICAL' }. The form shows everything else as it is now. Omit to just open the entry.",
  ),
});

/** The entry as it was when the form opened: what Claude reads, and what `changed` is measured from. */
export const EntrySnapshotSchema = LogbookEntrySchema.pick({
  category: true,
  severity: true,
  title: true,
  body: true,
  occurredAt: true,
}).extend({
  asset: z.string().nullable().describe('The asset it is about; null for none.'),
});
export type EntrySnapshot = z.infer<typeof EntrySnapshotSchema>;

export const EditLogbookEntryToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  entry: EntrySnapshotSchema.describe('The entry as it was when the form opened.'),
  outcome: z.discriminatedUnion('status', [EditSavedSchema, FormClosedSchema]).optional().describe(OUTCOME_DESCRIPTION),
});

// ─── Forms: recording what the user did ─────────────────────────────────────

/**
 * Body of PUT /ai/conversations/:id/forms/:toolCallId, sent by the browser
 * after the user saved a form (through the page's own endpoint) or closed it.
 * Only the saved record's id comes from the browser; the server reads the
 * record itself to write the outcome.
 */
export const FormOutcomeRequestSchema = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('saved'),
      entityId: z.guid().describe('The record the form saved: the one it created, or the one it edited.'),
    }),
    z.object({ status: z.literal('closed') }),
  ])
  .meta({ id: 'FormOutcomeRequest' });
export type FormOutcomeRequest = z.infer<typeof FormOutcomeRequestSchema>;

/** The response: the form tool's output with its `outcome` added. */
export const FormToolOutputSchema = z
  .union([
    CreateUserToolOutputSchema,
    CreateAlarmRuleToolOutputSchema,
    EditAlarmRuleToolOutputSchema,
    CreateDeviceToolOutputSchema,
    EditDeviceToolOutputSchema,
    CreateTagToolOutputSchema,
    EditTagToolOutputSchema,
    CreateAssetToolOutputSchema,
    EditAssetToolOutputSchema,
    CreateLogbookEntryToolOutputSchema,
    EditLogbookEntryToolOutputSchema,
  ])
  .meta({ id: 'FormToolOutput' });

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
  listAssets: {
    description:
      "Find assets: the regions, sites, areas and equipment of the plant's hierarchy, each with its parent, how many sub-assets and devices it holds, whether it is in service, and its open alarms. Filter by name or code, level, a branch of the tree, the direct children of one asset, and service status. It lists the assets themselves, not the devices, tags or alarms at them.",
    inputSchema: ListAssetsToolInputSchema,
    outputSchema: ListAssetsToolOutputSchema,
  },
  createUser: {
    description:
      "Open the Add user form in the chat, pre-filled from the request, so the admin can check it, set a temporary password and add the account. Call it whenever the user wants to add a user, even with no details ('add a new user'): every field is optional, and the form opens with its usual blanks. Don't ask for the details first. It doesn't add the account itself: only the user's click on the form does. Never pass a password; the admin types it into the form.",
    inputSchema: CreateUserToolInputSchema,
    outputSchema: CreateUserToolOutputSchema,
  },
  createAlarmRule: {
    description:
      "Open the New alarm rule form in the chat, pre-filled from the request, so the admin can check it and create the rule. A rule raises an alarm when a reading of its tag crosses its threshold. Call it whenever the user wants a new rule, even with no details ('I want to create a new rule'): every field is optional, and the form opens with the same defaults as on the Alarm rules page. Don't ask for the tag, threshold or anything else first; fill in only what the user said, and they complete the rest in the form. It doesn't create the rule itself.",
    inputSchema: CreateAlarmRuleToolInputSchema,
    outputSchema: CreateAlarmRuleToolOutputSchema,
  },
  editAlarmRule: {
    description:
      "Open the Edit alarm rule form in the chat for one existing rule: its current values, with the changes the user asked for already applied, so the admin can check them and save. All it needs is which rule; the changes are optional ('edit the wet well high level rule' just opens it). It doesn't change the rule itself. A rule's tag can't be changed.",
    inputSchema: EditAlarmRuleToolInputSchema,
    outputSchema: EditAlarmRuleToolOutputSchema,
  },
  createDevice: {
    description:
      "Open the Register a device form in the chat, pre-filled from the request, so the admin can check it and register the device: an RTU, PLC, drive, analyser or sensor that reports readings. Call it whenever the user wants to add or register a device, even with no details ('add a new device'): every field is optional, and the form opens with the same defaults as on the Devices page. Don't ask for the asset, serial number or anything else first. It doesn't register the device itself.",
    inputSchema: CreateDeviceToolInputSchema,
    outputSchema: CreateDeviceToolOutputSchema,
  },
  editDevice: {
    description:
      "Open the edit form of one existing device in the chat: its current values, with the changes the user asked for already applied, so the admin can check them and save. Use it to rename a device, move it to another asset, change its status (e.g. into maintenance), firmware or IP address. All it needs is which device; the changes are optional ('edit the PS-01 RTU' just opens it). A status change is also written to the logbook. It doesn't change the device itself.",
    inputSchema: EditDeviceToolInputSchema,
    outputSchema: EditDeviceToolOutputSchema,
  },
  createTag: {
    description:
      "Open the New tag form in the chat, pre-filled from the request, so the admin can check it and add the tag: a datapoint a device reports (a level, a pressure, a pump's running state). Call it whenever the user wants a new tag, even with no details ('add a tag'): every field is optional, and the form opens with the same defaults as on the Tags page. Don't ask for the device, code or anything else first. It doesn't add the tag itself.",
    inputSchema: CreateTagToolInputSchema,
    outputSchema: CreateTagToolOutputSchema,
  },
  editTag: {
    description:
      "Open the edit form of one existing tag in the chat: its current values, with the changes the user asked for already applied, so the admin can check them and save. Use it to rename a tag, change its unit, range or log interval, or switch it off. All it needs is which tag; the changes are optional ('edit the inlet pressure tag' just opens it). A tag can't move to another device. It doesn't change the tag itself.",
    inputSchema: EditTagToolInputSchema,
    outputSchema: EditTagToolOutputSchema,
  },
  createAsset: {
    description:
      "Open the New asset form in the chat, pre-filled from the request, so the admin can check it and add the asset to the plant's tree: a region, site, area or piece of equipment. Call it whenever the user wants to add an asset, even with no details ('add a new site'): every field is optional, and the form opens with the same defaults as on the Assets page. Don't ask for the code, the parent or anything else first. It doesn't create the asset itself.",
    inputSchema: CreateAssetToolInputSchema,
    outputSchema: CreateAssetToolOutputSchema,
  },
  editAsset: {
    description:
      "Open the edit form of one existing asset in the chat: its current values, with the changes the user asked for already applied, so the admin can check them and save. Use it to rename an asset, change its code, type, description, address or coordinates, take it out of service, or move it under another asset (everything below it moves along; never under itself or anything below it). All it needs is which asset; the changes are optional ('edit Hillcrest Reservoir' just opens it). It doesn't change the asset itself.",
    inputSchema: EditAssetToolInputSchema,
    outputSchema: EditAssetToolOutputSchema,
  },
  createLogbookEntry: {
    description:
      "Open the Write in the logbook form in the chat, pre-filled from the request, so the user can check it and add the entry: an operator note, a maintenance record or a shift handover, which everyone on the team sees. Call it whenever the user wants to write, log or note something in the logbook, even with no details ('I want to write a handover'): every field is optional, and the form opens with the same defaults as on the Logbook page (a note, Info, now). Don't ask for anything first. It doesn't add the entry itself.",
    inputSchema: CreateLogbookEntryToolInputSchema,
    outputSchema: CreateLogbookEntryToolOutputSchema,
  },
  editLogbookEntry: {
    description:
      "Open the edit form of one of the user's own logbook entries in the chat: its current values, with the changes the user asked for already applied, so they can check them and save. Only its author can edit an entry: nobody can edit someone else's entry or an event the system recorded, so say that instead of calling this. The list holds only the user's latest entries; for an older one, say so and point to the Logbook page, where the entry's row has Edit. All it needs is which entry; the changes are optional. It doesn't change the entry itself.",
    inputSchema: EditLogbookEntryToolInputSchema,
    outputSchema: EditLogbookEntryToolOutputSchema,
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

/** A form tool's call inside a message. */
export type FormToolUIPart = ToolUIPart<Pick<GenUITools, FormToolName>>;
/** Any form tool's output. */
export type FormToolOutput = GenUITools[FormToolName]['output'];
/** What the user did with a form, once recorded. */
export type FormOutcome = NonNullable<FormToolOutput['outcome']>;

/** A message part that is a form tool's call (parts are typed `tool-<name>`). */
export const isFormToolPart = (part: { type: string }): part is FormToolUIPart =>
  part.type.startsWith('tool-') && isFormToolName(part.type.slice('tool-'.length));

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
