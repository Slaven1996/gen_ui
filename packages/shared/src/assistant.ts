import type { ToolUIPart, UIMessage } from 'ai';
import { z } from 'zod';
import {
  ALARM_SEVERITIES,
  AlarmConditionSchema,
  AlarmDefinitionSchema,
  AlarmSchema,
  AlarmSeveritySchema,
  AlarmStateSchema,
} from './alarms.js';
import { KpiMetricSchema, TOP_ALARMS_GROUPINGS, TREND_INTERVALS } from './analytics.js';
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
import { pageParams, paginatedSchema, RelativeRangeSchema, timeZoneParam } from './common/query.js';
import {
  WidgetHeightSchema,
  WidgetTypeSchema,
  WidgetWidthSchema,
  type WidgetConfigInput,
  type WidgetType,
} from './dashboards.js';
import {
  AuditLogSchema,
  LOGBOOK_SOURCES,
  LogbookCategorySchema,
  LogbookEntrySchema,
  LogSeveritySchema,
  UserLogbookCategorySchema,
} from './logbook.js';
import {
  ChartTypeSchema,
  MAX_SERIES_TAGS,
  SERIES_INTERVALS,
  SeriesAggregateSchema,
  SeriesIntervalSchema,
  TagStatsSchema,
} from './telemetry.js';
import {
  ClockTimeSchema,
  MAX_COPIED_SHIFTS,
  MAX_SHIFT_OCCURRENCES,
  SHIFT_CALENDAR_VIEWS,
  SHIFT_GROUPINGS,
  SHIFT_SCOPES,
  ShiftRoleSchema,
  ShiftTemplateSchema,
} from './shifts.js';
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

/** A saved conversation holds at most this many messages; then the user starts a new chat. */
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

// ─── Conversations ──────────────────────────────────────────────────────────

/*
 * Each user has any number of saved chats. A chat is created by its first
 * message (its id comes from the browser), so there are no empty ones.
 */

/** A chat title's length: the first question clipped, the AI's title, or the user's own. */
export const CONVERSATION_TITLE_MAX = 80;

const ConversationTitleSchema = z
  .string()
  .describe('The first question until the first answer ends, then a short title written by Claude, or one the user gave.');

/** One chat in the list: no messages. */
export const ConversationSummarySchema = z
  .object({
    id: z.uuid(),
    title: ConversationTitleSchema,
    createdAt: z.iso.datetime().describe('When its first message was sent.'),
    updatedAt: z.iso.datetime().describe('Its last activity (a question, an answer, a form saved in it). Renaming leaves it.'),
  })
  .meta({ id: 'ConversationSummary' });
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const ListConversationsQuerySchema = z.object({ ...pageParams(30, 100) });
export type ListConversationsQueryInput = z.input<typeof ListConversationsQuerySchema>;
export type ListConversationsQuery = z.output<typeof ListConversationsQuerySchema>;

/** The caller's chats, latest activity first. */
export const ConversationListSchema = paginatedSchema(ConversationSummarySchema).meta({ id: 'ConversationList' });
export type ConversationList = z.infer<typeof ConversationListSchema>;

export const ConversationSchema = z
  .object({
    id: z.uuid(),
    title: ConversationTitleSchema,
    messages: z.array(z.unknown()).describe('AI SDK UI messages, oldest first, parts included.'),
  })
  .meta({ id: 'Conversation' });

/** A saved conversation. The server only stores messages it has validated. */
export interface Conversation {
  id: string;
  title: string;
  messages: GenUIMessage[];
}

export const RenameConversationSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(CONVERSATION_TITLE_MAX)
      .describe(`The chat's new title, at most ${CONVERSATION_TITLE_MAX} characters.`),
  })
  .meta({ id: 'RenameConversation' });
export type RenameConversationDto = z.output<typeof RenameConversationSchema>;

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
 * query too, and the chat can link to that page with the same filters. The
 * one exception is the on-duty card's `when`, which picks one half of the
 * Shifts page's on-duty strip. A details card takes one record's id, which
 * its page carries without the `Id` (`deviceId` → `/devices?device=…`) to
 * open the same panel. A dashboard draft holds a whole dashboard: each
 * widget's config is the query of that widget's page. A helper tool
 * (HELPER_TOOL_NAMES) has no page: Claude calls it for itself, and the chat
 * never draws it.
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
 * calendar days, and lengths no `range` value matches ('last 9 days'), from
 * the session's current time and UTC offset.
 */
const timeWindowFields = (things: string) => ({
  range: RelativeRangeSchema.optional().describe(
    `Only ${things} in a window ending now, when its length is exactly one of these: 'last hour' → 1h, 'last 6 hours' → 6h, 'last 12 hours' → 12h, 'last 24 hours' → 24h, 'last 7 days' or 'this past week' → 7d, 'last 30 days' → 30d, 'last 90 days' → 90d; 'recently' → 7d. Any other length is not a range: never round it to the nearest one, set from instead ('last 9 days', 'last 3 hours', 'last 48 hours', 'past two weeks'). Calendar days ('today', 'yesterday', 'since Monday') also go in from and to. Leave it out when you set from or to.`,
  ),
  from: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      "Start of the window, inclusive, in ISO 8601 with the session's UTC offset. A length that isn't a range value is the session's current time minus that length, without to: at Monday 2026-09-28 14:05 +02:00, 'last 9 days' → 2026-09-19T14:05:00+02:00, 'last 3 hours' → 2026-09-28T11:05:00+02:00, 'past two weeks' → 2026-09-14T14:05:00+02:00. Calendar days are the user's: 'today' → today at 00:00, 'yesterday' → yesterday at 00:00 (with to = today at 00:00), 'since Monday' → Monday at 00:00.",
    ),
  to: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("End of the window, exclusive, in the same format as from. Omit for a window that runs until now, such as 'last 9 days'."),
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
      "What was done: a family ending in '.', or one exact action. Families: auth. (sign-ins), user. (accounts), asset., device., tag., alarm. (acknowledging and clearing alarms), alarm_definition. (alarm rules), logbook., shift_template., shift_assignment. (the shift schedule), dashboard., assistant_instructions. (the assistant's instructions on the Settings page). An exact action is a family plus a verb: create, update or delete, and also auth.login, user.password_change, asset.move, alarm.acknowledge, alarm.clear, dashboard.widget_add, dashboard.widget_update and dashboard.widget_remove. 'changes to alarm rules' → 'alarm_definition.'; 'who acknowledged alarms' → 'alarm.acknowledge'; 'deleted devices' → 'device.delete'; 'sign-ins' → 'auth.login'. Omit for every action.",
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
      // Optional only so saved chats from before it was added still validate.
      id: z.guid().optional().describe("The alarm's id: what showing this one alarm on its own takes."),
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

// ─── Shifts ─────────────────────────────────────────────────────────────────

/*
 * Shift dates and times are the plant's (`SHIFT_TIME_ZONE`), not the user's:
 * the session's Plant line gives today there. A shift belongs to the day it
 * starts on, so a night shift is the evening's.
 */

/** How every shift date field says whose calendar it is on. */
const PLANT_DATE = "YYYY-MM-DD, on the plant's calendar (the session's Plant line).";

/** Shift templates, as the page's Shift dropdown sets them: ids from Claude's shift template list. */
const templateIdsField = (description: string) => z.array(z.guid()).min(1).max(50).optional().describe(description);

const shiftRolesField = (things: string) =>
  z
    .array(ShiftRoleSchema)
    .min(1)
    .optional()
    .describe(
      `The roles ${things}: OPERATOR, SUPERVISOR, or ON_CALL (on call: reachable, not on site). 'supervisors' → ['SUPERVISOR']; 'who is on call' → ['ON_CALL']. Omit for every role.`,
    );

/** A time on the plant's clock, as the forms show it. */
const clock = z.string().describe('HH:mm, plant time.');

/** Apart from `title`, every field is also a `/shifts` URL param. */
export const ShowShiftCalendarToolInputSchema = z.object({
  title: titleField("'Next week' or 'Noah's shifts in October'"),
  view: z
    .enum(SHIFT_CALENDAR_VIEWS)
    .optional()
    .describe(
      "The period: week (Monday–Sunday, the default), month, or day. 'next week' → week; 'in October' → month; 'tonight', 'on Saturday' → day. Omit for a week.",
    ),
  date: z.iso
    .date()
    .optional()
    .describe(
      `Any day of the period, ${PLANT_DATE} 'next week' → any day of next week; 'in October' → 2026-10-01; 'on Saturday' → that Saturday. Omit for the period holding today.`,
    ),
  group: z
    .enum(SHIFT_GROUPINGS)
    .optional()
    .describe(
      "How a week's rows go: shift (the default: a row per shift, who works it each day) or person (a row per person, their shifts each day). 'by person', 'who works which days', 'Noah's week' → person. Omit for shift. Only a week uses it.",
    ),
  userId: peopleField(
    "The ids of the people whose shifts to show, from the people list, or from the former-people list for someone deactivated: 'Noah's shifts' → [the id of Noah Bennett]. Staffing gaps still show. Omit for everyone.",
  ),
  templateId: templateIdsField(
    "The ids of the shifts to show, from the shift template list: 'night shifts' → [the id of Night]; 'weekend on-call' → [its id]. Omit for every shift.",
  ),
  role: shiftRolesField('people are scheduled in'),
});

export const ShowShiftCalendarToolOutputSchema = z.object({
  timeZone: z.string().describe('The plant time zone every date and time here is in.'),
  view: z.enum(SHIFT_CALENDAR_VIEWS),
  from: z.iso.date().describe("First day of the period; for a month, the month's first day."),
  to: z.iso.date().describe("Last day of the period, inclusive; for a month, the month's last day."),
  total: z.int().describe('Every shift starting in the period that matches, not only the ones returned.'),
  shifts: z
    .array(
      z.object({
        date: z.iso.date().describe('The day it starts on.'),
        shift: z.string().describe("The shift's name."),
        start: clock,
        end: clock.describe('HH:mm, plant time; earlier than start when it ends the next day.'),
        person: z.string(),
        role: ShiftRoleSchema,
        notes: z.string().nullable(),
      }),
    )
    .describe(
      "The first shifts, earliest first. When `total` is higher, the rest aren't here: for a later day, ask again for that week or day, or narrow by person, shift or role.",
    ),
  gaps: z
    .array(z.object({ date: z.iso.date(), shift: z.string(), role: ShiftRoleSchema, missing: z.int() }))
    .describe('Staffing targets not met: how many more people of a role a shift needs that day.'),
  deactivated: z
    .array(z.string())
    .optional()
    .describe(
      'People with shifts here whose accounts are deactivated: their shifts stay planned but leave the post unfilled, so they count in the gaps too. Absent when there are none.',
    ),
});

export const ON_DUTY_WHEN = ['now', 'next'] as const;

/** `role` is the page's URL param; `when` picks which half of the page's on-duty strip to show. */
export const ShowOnDutyToolInputSchema = z.object({
  when: z
    .enum(ON_DUTY_WHEN)
    .describe(
      "now: who is on shift at this moment, the people alarm escalation would page. next: who takes over at the next handover (the next shift start within 24 hours), and when. One per call: for 'who is on now and who is next', make two calls.",
    ),
  role: shiftRolesField('they are on shift in'),
});

export const ShowOnDutyToolOutputSchema = z.object({
  when: z.enum(ON_DUTY_WHEN),
  timeZone: z.string().describe('The plant time zone the times are in.'),
  people: z
    .array(
      z.object({
        name: z.string(),
        role: ShiftRoleSchema,
        shift: z.string().describe("The shift's name."),
        from: z.string().describe('When the shift starts, YYYY-MM-DD HH:mm, plant time.'),
        until: z.string().describe('When it ends, YYYY-MM-DD HH:mm, plant time.'),
      }),
    )
    .describe('Empty when nobody is on shift now, or no shift starts in the next 24 hours.'),
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

// ─── Graphs ─────────────────────────────────────────────────────────────────

/** Apart from `title`, every field is also a `/graphs` URL param. */
export const PlotTagsToolInputSchema = z.object({
  title: titleField("'Wet well level, last 7 days' or 'Riverside pressures today'"),
  tagIds: z
    .array(z.guid())
    .min(1)
    .max(MAX_SERIES_TAGS)
    .describe(
      `The ids of the tags to plot, from the tag list, at most ${MAX_SERIES_TAGS}. Match the user's words to a tag's name, code, unit or asset, allowing for typos, partial names and words in Serbian: 'the wet well level' → that tag's id; 'pressures at Riverside' → the id of every pressure tag at Riverside Pumping Station.`,
    ),
  ...timeWindowFields('readings'),
  interval: z
    .union([z.literal('auto'), SeriesIntervalSchema])
    .optional()
    .describe(
      "Bucket width: each point on the chart combines the readings in one bucket. 'hourly' → 1h, 'daily' → 1d, 'per minute' → 1m. Omit (auto) unless the user asks for one; auto fits the window.",
    ),
  aggregate: SeriesAggregateSchema.optional().describe(
    "How the readings in one bucket are combined: avg (the default), min, max, sum, or last (the bucket's last reading). 'daily peaks' → max with interval 1d; 'total per hour' → sum with interval 1h. Omit for the average.",
  ),
  chartType: ChartTypeSchema.optional().describe(
    'line (the default), step (values held until the next reading, good for on/off tags), area, or bar. Omit unless the user asks for a kind of chart.',
  ),
});

export const PlotTagsToolOutputSchema = z.object({
  interval: SeriesIntervalSchema.describe('The bucket width the chart uses.'),
  tags: z.array(
    TagStatsSchema.pick({ min: true, max: true, avg: true, last: true, lastAt: true }).extend({
      name: z.string(),
      unit: z.string().nullable(),
      asset: z.string().describe('Where the tag is.'),
      count: z.int().describe('Readings in the window; 0 means the chart shows no line for this tag.'),
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
  'scheduleShift',
  'editShift',
  'removeShift',
  'copyShiftWeek',
  'createShiftTemplate',
  'editShiftTemplate',
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
  scheduleShift: 'Schedule a shift',
  editShift: 'Edit a shift',
  removeShift: 'Remove a shift',
  copyShiftWeek: 'Copy a week',
  createShiftTemplate: 'New shift template',
  editShiftTemplate: 'Edit shift template',
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

// ─── Forms: shifts ──────────────────────────────────────────────────────────

const PLANT_ZONE_DESCRIPTION = "The plant time zone the form's dates and times are in.";

const shiftRoleField = ShiftRoleSchema.describe(
  'The role they work it in: OPERATOR, SUPERVISOR, or ON_CALL (on call: reachable, not on site).',
);

const shiftLengthField = z
  .int()
  .min(15)
  .max(24 * 60)
  .describe("Its length in minutes, wall-clock: '12-hour' → 720; 'from 10 to 18' → 480.");

const weekdaysField = z
  .array(z.int().min(0).max(6))
  .min(1)
  .max(7)
  .describe('Weekdays, 0 = Sunday, 1 = Monday … 6 = Saturday: weekdays → [1, 2, 3, 4, 5]; weekends → [0, 6].');

/** Shifts already planned that a form's save would overlap, found when it opens. */
const ShiftClashesSchema = z
  .object({
    count: z.int(),
    examples: z.array(z.string()).describe('Up to three, earliest first: "Noah Bennett, Night on 2026-11-07 22:00".'),
  })
  .optional()
  .describe(
    "Shifts already planned that saving the form as it opened would overlap: nobody can be on two shifts at once, so the save fails until the user changes the form or those shifts. Tell the user. Absent when there are none.",
  );

/** What the Schedule a shift form opens with, each optional: only what the user said. */
const ShiftSchedulePrefillSchema = z
  .object({
    userId: z
      .guid()
      .describe("The id of the person to schedule, from the people list: 'put Sofia on mornings' → the id of Sofia Reyes."),
    templateId: z
      .guid()
      .describe(
        "The id of the shift, from the shift template list (active ones only): 'the morning shift' → the id of Morning.",
      ),
    role: shiftRoleField.describe(
      "The role they work it in: OPERATOR, SUPERVISOR, or ON_CALL (on call: reachable, not on site). Omit if not said: the form takes the role the shift's staffing target asks for.",
    ),
    date: z.iso
      .date()
      .describe(
        `The day the shift starts on (with a repeat, the first day), ${PLANT_DATE} 'tonight's night shift' → today; 'from Monday' → that Monday. Omit for today.`,
      ),
    startTime: ClockTimeSchema.describe(
      "Own start time, HH:mm, only when the user gives other hours than the shift's: 'from 10 to 18' → '10:00'.",
    ),
    durationMinutes: shiftLengthField.describe(
      "Own length in minutes, with startTime, only when the user gives other hours than the shift's: 'from 10 to 18' → 480.",
    ),
    notes: z.string().max(500).describe("A note on the shift, in the user's own words."),
    repeat: z
      .object({
        until: z.iso.date().describe(`The last day it may fall on, inclusive, ${PLANT_DATE}`),
        weekdays: weekdaysField,
      })
      .describe(
        `Repeat weekly: 'every weekday until the end of the month' → { until: the month's last day, weekdays: [1, 2, 3, 4, 5] }. At most ${MAX_SHIFT_OCCURRENCES} shifts. Omit for one day.`,
      ),
  })
  .partial();
export type ShiftSchedulePrefill = z.infer<typeof ShiftSchedulePrefillSchema>;

export const ScheduleShiftToolInputSchema = ShiftSchedulePrefillSchema;

export const ScheduleShiftToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  person: z.string().nullable().describe('The person chosen in the form; null when the user picks them there.'),
  shift: z.string().nullable().describe('The shift chosen in the form; null when the user picks it there.'),
  timeZone: z.string().describe(PLANT_ZONE_DESCRIPTION),
  clashes: ShiftClashesSchema,
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        scheduled: z
          .object({
            person: z.string(),
            shift: z.string(),
            role: ShiftRoleSchema,
            shifts: z.int().describe('How many shifts were created: one, or one per repeat.'),
            from: z.iso.date().describe('The first day.'),
            to: z.iso.date().describe('The last day.'),
          })
          .describe('Who was scheduled on which shift, and on how many days.'),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

/** A scheduled shift's editable values, each optional: only what the user asked to change. */
const ShiftChangesSchema = z
  .object({
    userId: z
      .guid()
      .describe("Hand the shift to another person, the id from the people list: 'give it to Liam' → the id of Liam Carter."),
    role: shiftRoleField,
    notes: z.string().max(500).nullable().describe('The new note; null to clear it.'),
    templateId: z
      .guid()
      .describe(
        "Make it another shift, the id from the shift template list (active ones only); it takes that shift's hours. Only with scope one.",
      ),
    date: z.iso.date().describe(`Move it to another day, ${PLANT_DATE} Only with scope one.`),
    startTime: ClockTimeSchema.describe('A new start time, HH:mm. Only with scope one.'),
    durationMinutes: shiftLengthField.describe('A new length in minutes. Only with scope one.'),
  })
  .partial();
export type ShiftChanges = z.infer<typeof ShiftChangesSchema>;

/** How the edit and remove forms name one scheduled shift: whose it is, and the plant day it starts. */
const shiftLookupFields = {
  userId: z
    .guid()
    .describe(
      "The id of the person whose shift it is, from the people list, or from the former-people list for someone deactivated: 'Noah's Saturday night' → the id of Noah Bennett.",
    ),
  date: z.iso
    .date()
    .describe(
      `The day the shift starts on, ${PLANT_DATE} A night shift is the evening's: 'Noah's Saturday night' → that Saturday.`,
    ),
  templateId: z
    .guid()
    .optional()
    .describe(
      "The id of the shift, from the shift template list, when the user names it: 'Noah's Saturday night' → the id of Night. Needed only if they have two shifts that day.",
    ),
};

export const EditShiftToolInputSchema = z.object({
  ...shiftLookupFields,
  scope: z
    .enum(SHIFT_SCOPES)
    .optional()
    .describe(
      "For a shift that repeats: one (the default, just this shift), following (this one and the later ones: 'from now on', 'every Saturday after this') or series (all of them). Shifts that already started are left alone. Across several shifts only the person, role and notes can change: a new day, shift or hours needs one.",
    ),
  changes: ShiftChangesSchema.optional().describe(
    "Only the values the user asked to change: 'give Noah's Saturday night to Liam' → { userId: the id of Liam Carter }. The form shows everything else as it is now. Omit to just open the shift.",
  ),
});

/** A shift as it was when the form opened: what Claude reads, and what `changed` is measured from. */
export const ShiftSnapshotSchema = z.object({
  person: z.string(),
  shift: z.string().describe("The shift's name."),
  role: ShiftRoleSchema,
  date: z.iso.date().describe('The day it starts on.'),
  start: clock,
  hours: z.number().describe('Its length in hours.'),
  notes: z.string().nullable(),
});
export type ShiftSnapshot = z.infer<typeof ShiftSnapshotSchema>;

export const EditShiftToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  shiftId: z.guid().describe('The shift the form opened on.'),
  timeZone: z.string().describe(PLANT_ZONE_DESCRIPTION),
  repeats: z.boolean().describe('Whether it is one of a series (a repeat, or a copied week).'),
  scope: z.enum(SHIFT_SCOPES).describe("Which shifts the form changes; always one for a shift that doesn't repeat."),
  shift: ShiftSnapshotSchema.describe('The shift as it was when the form opened.'),
  clashes: ShiftClashesSchema,
  outcome: z
    .discriminatedUnion('status', [
      EditSavedSchema.extend({ shifts: z.int().describe('How many shifts the save changed.') }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

export const RemoveShiftToolInputSchema = z.object({
  ...shiftLookupFields,
  scope: z
    .enum(SHIFT_SCOPES)
    .optional()
    .describe(
      "For a shift that repeats: one (the default, just this shift), following (this one and the later ones: 'from now on', 'every Saturday after this') or series (all of them). Shifts that already started are kept.",
    ),
});

export const RemoveShiftToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  shiftId: z.guid().describe('The shift the form opened on.'),
  timeZone: z.string().describe(PLANT_ZONE_DESCRIPTION),
  repeats: z.boolean().describe('Whether it is one of a series (a repeat, or a copied week).'),
  seriesId: z.guid().nullable().describe("The series it belongs to; null when it doesn't repeat."),
  scope: z.enum(SHIFT_SCOPES).describe("Which shifts the form removes; always one for a shift that doesn't repeat."),
  shift: ShiftSnapshotSchema.describe('The shift the form opened on.'),
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        removed: z.object({
          shift: z
            .boolean()
            .describe('Whether the shift the form opened on is gone; false when it had already started and only later ones were removed.'),
          remaining: z
            .int()
            .nullable()
            .describe("How many shifts of its series are still planned from now on; null when it didn't repeat."),
        }),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

export const CopyShiftWeekToolInputSchema = z.object({
  week: z.iso
    .date()
    .optional()
    .describe(`Any day of the week to copy (Monday–Sunday), ${PLANT_DATE} 'last week' → a day 7 days ago. Omit for this week.`),
  weeks: z
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe("How many of the weeks after it to fill, 1–8: 'to next week' → 1; 'for the next 3 weeks' → 3. Omit if not said: the form starts on 1."),
  userId: peopleField("Copy only these people's shifts: ids from the people list. Omit for everyone's."),
  templateId: templateIdsField(
    "Copy only these shifts: ids from the shift template list. 'copy the nights' → [the id of Night]. Omit for every shift.",
  ),
});

export const CopyShiftWeekToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  week: z.object({ from: z.iso.date(), to: z.iso.date() }).describe('The week being copied, Monday to Sunday.'),
  people: z.array(z.string()).nullable().describe("Whose shifts are copied; null for everyone's."),
  shifts: z.array(z.string()).nullable().describe('Which shifts are copied; null for all of them.'),
  copies: z
    .int()
    .optional()
    .describe('How many shifts the copy creates into the number of weeks the form opens with.'),
  clashes: ShiftClashesSchema,
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        copied: z
          .object({ shifts: z.int(), from: z.iso.date(), to: z.iso.date() })
          .describe('How many shifts were created, and the first and last day they fall on.'),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

/** A shift template's values, each optional: only what the user said. */
const ShiftTemplatePrefillSchema = z
  .object({
    name: z.string().max(60).describe("The shift's name, e.g. 'Weekend day'."),
    startTime: ClockTimeSchema.describe("When it starts, HH:mm, plant time: 'from 7' → '07:00'."),
    durationMinutes: shiftLengthField,
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .describe("Its colour on the calendar, #rrggbb, only if the user names one: 'green' → '#16a34a'."),
    isActive: z
      .boolean()
      .describe('false to switch the shift off: past shifts keep it, but nobody can be scheduled on it.'),
    coverage: z
      .array(z.object({ role: ShiftRoleSchema, weekdays: weekdaysField, headcount: z.int().min(1).max(20) }))
      .max(12)
      .describe(
        "Its staffing targets, the whole list (it replaces the current one): how many people of a role it needs on the weekdays it starts on. 'one operator daily and a supervisor on weekdays' → [{ role: 'OPERATOR', weekdays: [0, 1, 2, 3, 4, 5, 6], headcount: 1 }, { role: 'SUPERVISOR', weekdays: [1, 2, 3, 4, 5], headcount: 1 }]. One rule per role and weekday. [] for none: it runs daily and is never short-staffed.",
      ),
  })
  .partial();
export type ShiftTemplatePrefill = z.infer<typeof ShiftTemplatePrefillSchema>;

export const CreateShiftTemplateToolInputSchema = ShiftTemplatePrefillSchema;

export const CreateShiftTemplateToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  outcome: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('saved'),
        template: ShiftTemplateSchema.pick({ name: true, startTime: true, durationMinutes: true }).describe(
          'The shift template that was added.',
        ),
      }),
      FormClosedSchema,
    ])
    .optional()
    .describe(OUTCOME_DESCRIPTION),
});

export const EditShiftTemplateToolInputSchema = z.object({
  templateId: z
    .guid()
    .describe(
      "The id of the shift template to edit, from the shift template list: 'the night shift' → the id of Night. If the user gave an id, use it.",
    ),
  changes: ShiftTemplatePrefillSchema.optional().describe(
    "Only the values the user asked to change: 'make the afternoon shift start at 15:00' → { startTime: '15:00' }. The form shows everything else as it is now. Omit to just open the template.",
  ),
});

/** The template as it was when the form opened: what Claude reads, and what `changed` is measured from. */
export const ShiftTemplateSnapshotSchema = ShiftTemplateSchema.pick({
  name: true,
  startTime: true,
  durationMinutes: true,
  color: true,
  isActive: true,
  coverage: true,
});
export type ShiftTemplateSnapshot = z.infer<typeof ShiftTemplateSnapshotSchema>;

export const EditShiftTemplateToolOutputSchema = z.object({
  status: z.literal('opened').describe(OPENED_DESCRIPTION),
  template: ShiftTemplateSnapshotSchema.describe('The template as it was when the form opened.'),
  outcome: z.discriminatedUnion('status', [EditSavedSchema, FormClosedSchema]).optional().describe(OUTCOME_DESCRIPTION),
});

// ─── Forms: recording what the user did ─────────────────────────────────────

/**
 * Body of PUT /ai/conversations/:id/forms/:toolCallId, sent by the browser
 * after the user saved a form (through the page's own endpoint) or closed it.
 * Only the saved records' ids come from the browser; the server reads the
 * records themselves to write the outcome.
 */
export const FormOutcomeRequestSchema = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('saved'),
      entityId: z.guid().describe('The record the form saved: the one it created, or the one it edited.'),
      entityIds: z
        .array(z.guid())
        .max(MAX_COPIED_SHIFTS)
        .optional()
        .describe(
          'Every record saved, for a form that saves several (a repeating shift, a copied week, a change to the rest of a series). Empty when the change skipped every shift.',
        ),
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
    ScheduleShiftToolOutputSchema,
    EditShiftToolOutputSchema,
    RemoveShiftToolOutputSchema,
    CopyShiftWeekToolOutputSchema,
    CreateShiftTemplateToolOutputSchema,
    EditShiftTemplateToolOutputSchema,
  ])
  .meta({ id: 'FormToolOutput' });

// ─── Details ────────────────────────────────────────────────────────────────

/*
 * One record as the details card its page opens on a row click: every field,
 * links to what belongs to it, and the buttons the user's role allows. The
 * call only shows it; changing the record is its edit form's job. Each
 * output is what Claude reads to answer, with names instead of ids.
 */

export const ShowAlarmToolInputSchema = z.object({
  alarmId: z
    .guid()
    .describe(
      "The id of one alarm, from an alarm list earlier in this conversation (each listed alarm has its id). When the user describes an alarm instead ('the last wet well alarm', 'that critical one at Riverside'), find the alarms first, then show the one meant. Never make an id up.",
    ),
});

export const ShowAlarmToolOutputSchema = z.object({
  alarm: AlarmSchema.pick({
    severity: true,
    state: true,
    triggerValue: true,
    clearValue: true,
    raisedAt: true,
    clearedAt: true,
    acknowledgedAt: true,
  }).extend({
    message: z.string().describe('The rule, the tag, its limit and the reading that tripped it.'),
    rule: z.string().describe('The alarm rule that raised it.'),
    tag: z.string().describe('The tag whose reading crossed the threshold.'),
    unit: z.string().nullable().describe('Unit of the trigger and clear values.'),
    asset: z.string().describe('Where it was raised.'),
    acknowledgedBy: z.string().nullable().describe('Who acknowledged it; null while nobody has.'),
    acknowledgeNote: z.string().nullable().describe('What they wrote when acknowledging it.'),
  }),
});

export const ShowAlarmRuleToolInputSchema = z.object({
  ruleId: z
    .guid()
    .describe(
      "The id of the rule, from the alarm rule list. Match the user's words to a rule's name, its tag or its asset, allowing for typos, partial names and words in Serbian: 'wet wel hihg levl' → the id of Wet well high level. If the user gave an id, use it.",
    ),
});

export const ShowAlarmRuleToolOutputSchema = z.object({
  rule: RuleSnapshotSchema.extend({
    tag: z.string().describe('The tag (signal) the rule watches.'),
    openAlarmCount: z.int().describe('How many of its alarms are still open.'),
  }),
});

export const ShowDeviceToolInputSchema = z.object({
  deviceId: z
    .guid()
    .describe(
      "The id of the device, from the device list. Match the user's words to a device's name, serial number or asset, allowing for typos, partial names and words in Serbian: 'the riverside rtu' → the id of PS-01 RTU. If the user gave an id, use it.",
    ),
});

export const ShowDeviceToolOutputSchema = z.object({
  device: DeviceSnapshotSchema.extend({
    lastSeenAt: z.iso.datetime().nullable().describe('When it last sent a reading; null if it never has.'),
    tagCount: z.int().describe('How many tags it reports.'),
  }),
});

export const ShowTagToolInputSchema = z.object({
  tagId: z
    .guid()
    .describe(
      "The id of the tag, from the tag list. Match the user's words to a tag's name, code or asset, allowing for typos, partial names and words in Serbian: 'inlet presure at riverside' → the id of that Inlet pressure. If the user gave an id, use it.",
    ),
});

export const ShowTagToolOutputSchema = z.object({
  tag: TagSnapshotSchema.extend({
    device: z.string().describe('The device that reports it.'),
    lastValue: z
      .number()
      .nullable()
      .describe('The latest reading; for DIGITAL tags 1 is on and 0 is off. null before the first one.'),
    lastValueAt: z.iso.datetime().nullable().describe('When that reading was taken.'),
    alarmRules: z.int().describe('How many alarm rules watch it.'),
    openAlarms: z.int().describe('How many of its alarms are still open.'),
  }),
});

// ─── Dashboards ─────────────────────────────────────────────────────────────

/*
 * A new dashboard put together from the user's description. Like a form tool
 * it never saves anything: the answer shows a preview drawn with the
 * Dashboard page's own grid and widgets, and its link opens the page with
 * this layout as an unsaved dashboard in edit mode, where the user completes
 * and saves it. The call itself is the draft: the page reads its input back
 * from the saved conversation (GET /ai/conversations/:id/dashboard-drafts/:toolCallId).
 * Whether a dashboard was saved from it is kept on that dashboard (its
 * source), not in the conversation, so deleting the dashboard makes the
 * draft "not created" again; the server tells Claude through `created`.
 *
 * A widget's config is its page's query, as on the Dashboard page
 * (WIDGET_CONFIG_SCHEMAS). Here it is one flat object holding every widget
 * type's fields, each optional and saying which types use it: far smaller
 * for the model than one variant per type. `execute` checks each widget
 * against its own type.
 */

export const MAX_DRAFT_WIDGETS = 12;

const DashboardWidgetConfigDraftSchema = z.object({
  metric: KpiMetricSchema.optional().describe(
    "KPI only: the figure. OPEN_ALARMS (raised and not closed yet), ACTIVE_ALARMS (condition still present), UNACKNOWLEDGED_ALARMS, CRITICAL_ALARMS (open critical ones), ALARMS_LAST_24H (raised in the last 24 hours), MTTA (mean time to acknowledge), DEVICES_ONLINE, DEVICES_OFFLINE (offline or faulted), ASSETS, TAGS. Omit if the user didn't say which figure or it is unclear which one they mean; don't ask.",
  ),
  tagId: z
    .guid()
    .optional()
    .describe(
      "TAG_VALUE only: the tag whose latest reading it shows, from the tag list. Match the user's words to a tag's name, code, unit or asset, allowing for typos and Serbian: 'the reservoir level' → that tag's id. Omit if the user didn't say which tag, or their words fit several tags equally well or none: a tag marked 'same name at …' fits only if they also named its asset or code. Don't ask; they pick it on the page.",
    ),
  tagIds: z
    .array(z.guid())
    .max(MAX_SERIES_TAGS)
    .optional()
    .describe(
      `TIME_SERIES only: the tags to chart, from the tag list, at most ${MAX_SERIES_TAGS}. Match the user's words the same way: 'pressures at Riverside' → the id of every pressure tag at Riverside Pumping Station. Omit if the user didn't say which tags, or it is unclear which of several they mean (a tag marked 'same name at …' without its asset or code), or none fits. Don't ask; they pick them on the page.`,
    ),
  assetId: z
    .guid()
    .optional()
    .describe(
      "KPI, ALARM_TABLE, ALARM_TREND, TOP_ALARMS, LOGBOOK_FEED and DEVICE_STATUS: only this asset and everything below it, from the asset list: 'for Riverside' → the id of Riverside Pumping Station. Omit for every asset, and also when the words fit several assets equally well or none: don't ask; the widget covers every asset until the user picks one on the page.",
    ),
  range: RelativeRangeSchema.optional().describe(
    "TAG_VALUE, TIME_SERIES, ALARM_TABLE, ALARM_TREND and TOP_ALARMS: the window, ending now. 'last hour' → 1h, 'today' or 'last 24 hours' → 24h, '7-day' or 'this week' → 7d, 'this month' → 30d. Omit for the widget's default: 24h for readings, 7d for the alarm trend, 30d for the most frequent alarms, any time for an alarm list.",
  ),
  interval: z
    .enum([...TREND_INTERVALS, 'auto', ...SERIES_INTERVALS])
    .optional()
    .describe(
      "ALARM_TREND: hour, day (default) or week per bar: 'alarms per week' → week. TIME_SERIES: auto (default), 1m, 5m, 15m, 1h, 6h or 1d per point: 'hourly' → 1h. Omit for the default.",
    ),
  aggregate: SeriesAggregateSchema.optional().describe(
    "TIME_SERIES only: how the readings in one point are combined: avg (default), min, max, sum, or last. 'daily peaks' → max with interval 1d.",
  ),
  chartType: ChartTypeSchema.optional().describe(
    'TIME_SERIES only: line (default), step (good for on/off tags), area or bar. Omit unless the user asks for a kind of chart.',
  ),
  state: z
    .array(AlarmStateSchema)
    .optional()
    .describe(
      "ALARM_TABLE only. ACTIVE: condition present, not acknowledged. ACKNOWLEDGED: present, acknowledged. CLEARED: gone, not acknowledged yet. CLOSED: gone and acknowledged. 'open alarms' → ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED']; 'unacknowledged' → ['ACTIVE', 'CLEARED']. Omit for every state.",
    ),
  severity: z
    .array(z.enum([...ALARM_SEVERITIES, 'WARNING']))
    .optional()
    .describe(
      "ALARM_TABLE and ALARM_TREND: alarm severities, CRITICAL, HIGH, MEDIUM, LOW, INFO: 'critical alarms' → ['CRITICAL']. LOGBOOK_FEED: entry severities, INFO, WARNING, CRITICAL: 'logbook warnings' → ['WARNING']. Omit for every severity.",
    ),
  groupBy: z
    .enum(TOP_ALARMS_GROUPINGS)
    .optional()
    .describe('TOP_ALARMS only: definition ranks the alarm rules that fire most (default); asset ranks the assets with the most alarms.'),
  limit: z.int().min(3).max(10).optional().describe('TOP_ALARMS only: how many it ranks, 3 to 10 (default 5).'),
  pageSize: z.int().min(3).max(20).optional().describe('ALARM_TABLE and LOGBOOK_FEED: rows shown, 3 to 20 (default 5).'),
  category: z
    .array(LogbookCategorySchema)
    .optional()
    .describe('LOGBOOK_FEED only: kinds of entry. NOTE, ALARM, DEVICE, MAINTENANCE, SHIFT (handovers). Omit for every kind.'),
  source: z
    .enum(LOGBOOK_SOURCES)
    .optional()
    .describe('LOGBOOK_FEED only: user for entries people wrote, system for the events the app recorded. Omit for both.'),
  role: z
    .array(ShiftRoleSchema)
    .optional()
    .describe('ON_DUTY only: the shift roles shown, OPERATOR, SUPERVISOR, ON_CALL. Omit for everyone on duty.'),
});

// Every widget config field has a field here: a new one fails to compile until the tool takes it too.
type DraftConfigKey = keyof z.infer<typeof DashboardWidgetConfigDraftSchema>;
type WidgetConfigKey = { [T in WidgetType]: keyof WidgetConfigInput<T> }[WidgetType];
const draftConfigCoversWidgets: [Exclude<WidgetConfigKey, DraftConfigKey>] extends [never] ? true : false = true;
void draftConfigCoversWidgets;

export const CreateDashboardToolInputSchema = z.object({
  name: z
    .string()
    .max(80)
    .optional()
    .describe(
      "A short name for the dashboard, from the request: 'a dashboard for Riverside' → 'Riverside'; 'my morning overview' → 'Morning overview'. Omit only if nothing in the request names it: the user names it on the page.",
    ),
  isShared: z
    .boolean()
    .optional()
    .describe('true only if the user asks to share it with everyone (others see it read-only). Omit to keep it private.'),
  widgets: z
    .array(
      z.object({
        type: WidgetTypeSchema.describe(
          'What the widget shows. KPI: one headline number. TAG_VALUE: one tag’s latest reading with a sparkline. TIME_SERIES: a chart of up to eight tags over time. ALARM_TABLE: a list of alarms. ALARM_TREND: alarms raised per hour, day or week, by severity. TOP_ALARMS: the rules or assets raising the most alarms. LOGBOOK_FEED: the latest logbook entries. DEVICE_STATUS: how many devices are online, offline, faulted or in maintenance. ON_DUTY: who is on shift right now.',
        ),
        title: z
          .string()
          .max(80)
          .optional()
          .describe("A short caption: 'Open critical alarms', 'Reservoir level, 7 days'. Omit for the type's default."),
        width: WidgetWidthSchema.optional().describe(
          "Columns out of 12: 3 (a quarter), 4 (a third), 6 (half), 8 (two thirds) or 12 (full width). Widgets fill rows left to right in order, so make each row add up to 12: four KPIs of 3, or a chart of 8 beside a list of 4. Omit for the type's default: 3 for KPI and TAG_VALUE, 8 for TIME_SERIES and ALARM_TABLE, 6 for ALARM_TREND, 4 for the rest.",
        ),
        height: WidgetHeightSchema.optional().describe(
          "Rows: 1 short (enough for a KPI or a live value), 2 standard, 3 tall. Omit for the type's default: 1 for KPI and TAG_VALUE, 2 for the rest.",
        ),
        config: DashboardWidgetConfigDraftSchema.optional().describe(
          "The widget's settings: only fields its type uses (each field names its types), and only what the user asked for. Omit for the type's defaults.",
        ),
      }),
    )
    .max(MAX_DRAFT_WIDGETS)
    .describe(
      `Every widget, in reading order: left to right, top to bottom. At most ${MAX_DRAFT_WIDGETS}. To change a draft ('make the chart wider', 'add the logbook'), call again with the whole layout.`,
    ),
});
export type CreateDashboardToolInput = z.infer<typeof CreateDashboardToolInputSchema>;

export const CreateDashboardToolOutputSchema = z.object({
  name: z.string().nullable().describe("The dashboard's name; null when the user still has to name it on the page."),
  widgets: z.array(
    z.object({
      title: z.string(),
      type: WidgetTypeSchema,
      shows: z.string().nullable().describe('What it shows, by name: its tags, or the asset it is limited to.'),
      missing: z
        .array(z.string())
        .describe("What the user still has to pick for it on the page, e.g. 'a tag'. Empty when it is complete."),
    }),
  ),
  created: z
    .object({ name: z.string().describe('Its name now; the user may have renamed it.') })
    .nullable()
    .optional()
    .describe(
      'Added by the app on later turns: the dashboard the user saved from this draft, or null while none is (never saved, or deleted since). Absent right after the call, when nothing is saved yet.',
    ),
});

/** GET /ai/conversations/:id/dashboard-drafts/:toolCallId: a draft, for the Dashboard page and the chat. */
export const DashboardDraftResponseSchema = z
  .object({
    draft: CreateDashboardToolInputSchema.describe("The call's input: the dashboard as the assistant put it together."),
    dashboard: z
      .object({ id: z.guid(), name: z.string() })
      .nullable()
      .describe('The dashboard saved from it, under its name now; null while none is.'),
  })
  .meta({ id: 'DashboardDraft' });
export type DashboardDraftResponse = z.infer<typeof DashboardDraftResponseSchema>;

// ─── Helper tools ───────────────────────────────────────────────────────────

/*
 * Tools Claude calls for itself, to fill another tool's fields. Their calls
 * are saved with the answer and read back by Claude on later turns, like any
 * other, but the chat never draws them.
 *
 * The lookup stands in for a pick list too long for the system prompt
 * (AI_PICK_LIST_INLINE_MAX): every tag, device or alarm rule, or only those
 * at one asset, as the same lines the prompt's list would have, with their
 * ids. Claude still matches the user's words to them itself.
 */

export const HELPER_TOOL_NAMES = ['lookup'] as const;
export type HelperToolName = (typeof HELPER_TOOL_NAMES)[number];

/** The pick lists a lookup can stand in for, named like their blocks in the system prompt (`<alarm-rules>`). */
export const LOOKUP_LISTS = ['tags', 'devices', 'alarm-rules'] as const;
export const LookupListSchema = z.enum(LOOKUP_LISTS);
export type LookupList = z.infer<typeof LookupListSchema>;

export const LookupToolInputSchema = z.object({
  list: LookupListSchema.describe(
    "Which list: 'tags' (the datapoints: for charts, current values, alarm rules and dashboards), 'devices' or 'alarm-rules'.",
  ),
  assetId: z
    .guid()
    .optional()
    .describe(
      "The id of the asset the user named, from the asset list: only the records at it and everything below it ('the wet well level at Riverside' → the id of Riverside Pumping Station). Omit when the user named no place.",
    ),
});

export const LookupToolOutputSchema = z.object({
  list: LookupListSchema,
  scope: z.string().nullable().describe('The asset looked in; null for everywhere.'),
  lines: z.array(z.string()).describe('One line per record, with its id.'),
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
  showShiftCalendar: {
    description:
      "Show the shift calendar the Shifts page draws: who works which shift on which day, over a week (the default), a month or a day, with the gaps where a shift has fewer people than its staffing target. Use it for the schedule and who works when ('who works next week', 'Noah's shifts in October', 'who is on nights this weekend', 'where are we short-staffed'). Filter by person, shift and role. For who is on duty at this moment, or who takes over next, show the on-duty card instead.",
    inputSchema: ShowShiftCalendarToolInputSchema,
    outputSchema: ShowShiftCalendarToolOutputSchema,
  },
  showOnDuty: {
    description:
      "Show who is on duty now, or who takes over next, as the card at the top of the Shifts page: each person with their role, shift and hours. 'now' is everyone on shift at this moment, the people alarm escalation would page; 'next' is everyone starting at the next handover within 24 hours. One of the two per call: for both, make two calls. For another day or a whole week, show the shift calendar instead.",
    inputSchema: ShowOnDutyToolInputSchema,
    outputSchema: ShowOnDutyToolOutputSchema,
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
  plotTags: {
    description:
      "Draw a chart of up to eight tags' readings over a time window, the one the Graphs page draws, with its filters so the user can change tags, window, buckets and chart type. Use it for trends, history and comparisons over time ('show the wet well level this week', 'how did pressure change since yesterday', 'chart the pump flows'). The result gives each tag's minimum, maximum, average and last reading in the window. For the current value only, find the tag instead.",
    inputSchema: PlotTagsToolInputSchema,
    outputSchema: PlotTagsToolOutputSchema,
  },
  listAssets: {
    description:
      "Find assets: the regions, sites, areas and equipment of the plant's hierarchy, each with its parent, how many sub-assets and devices it holds, whether it is in service, and its open alarms. Filter by name or code, level, a branch of the tree, the direct children of one asset, and service status. It lists the assets themselves, not the devices, tags or alarms at them.",
    inputSchema: ListAssetsToolInputSchema,
    outputSchema: ListAssetsToolOutputSchema,
  },
  showAlarm: {
    description:
      "Show one alarm's details card, the panel the Alarms page opens on a row click: its rule, tag and asset, when it was raised and cleared and at which readings, who acknowledged it, and its timeline, with buttons to acknowledge it, chart its tag and add a note. Use it when the user asks about one particular alarm ('tell me more about that wet well alarm', 'details of the last critical alarm'). It takes an alarm's id from an alarm list in this conversation; without one, find the alarms first. For several alarms, find them instead.",
    inputSchema: ShowAlarmToolInputSchema,
    outputSchema: ShowAlarmToolOutputSchema,
  },
  showAlarmRule: {
    description:
      "Show one alarm rule's details card, the panel the Alarm rules page opens on a row click: its tag and asset, condition, threshold, deadband, severity, description, whether it is enabled, and how many of its alarms are open, with links to them. Use it when the user asks about one rule ('details of the wet well high level rule', 'what does the low chlorine rule check'). For several rules, find them instead; to change one, open its edit form.",
    inputSchema: ShowAlarmRuleToolInputSchema,
    outputSchema: ShowAlarmRuleToolOutputSchema,
  },
  showDevice: {
    description:
      "Show one device's details card, the panel the Devices page opens on a row click: its status, asset, serial number, model and manufacturer, protocol, firmware, IP address, install date, last reading and how many tags it reports, with a link to them. Use it when the user asks about one device ('details of the PS-01 RTU', 'tell me about the reservoir PLC'). For several devices, find them instead; to change one, open its edit form.",
    inputSchema: ShowDeviceToolInputSchema,
    outputSchema: ShowDeviceToolOutputSchema,
  },
  showTag: {
    description:
      "Show one tag's details card, the panel the Tags page opens on a row click: its latest reading, description, type, unit, range, log interval, device and asset, and how many alarm rules watch it and how many of its alarms are open, with links to them. Use it when the user asks about one tag ('details of the inlet pressure at Riverside', 'tell me about PS01.WET_WELL_LEVEL'). For just current values, find the tags instead; for its history, draw a chart; to change it, open its edit form.",
    inputSchema: ShowTagToolInputSchema,
    outputSchema: ShowTagToolOutputSchema,
  },
  createDashboard: {
    description:
      "Put together a new dashboard from the user's description and show it in the chat as a preview, drawn with the Dashboard page's own widgets: headline KPIs, live tag values, charts, alarm lists and trends, the most frequent alarms, the logbook, device health and who is on duty. Anyone can build one. It doesn't create the dashboard: the preview's link opens it on the Dashboard page, unsaved, where the user fills in what is missing and saves it. Call it whenever the user wants a dashboard, even with few details, and never ask the user anything first, not even which tag, asset or figure they mean: fill in only what is clear, and they complete the rest on the page. Leave a choice out when the user didn't make it, when their words fit several entries of a list equally well, or when nothing fits. A widget without its tag or figure still shows in the preview, marked as needing it. The result lists what each widget still lacks; after it, say in one sentence what is left to pick, if anything (naming the entries that fit, for an unclear one), and that they save it from the Dashboard page. To change the draft, call it again with the whole layout. It can't change a dashboard that already exists: for that, point the user to Edit on the Dashboard page.",
    inputSchema: CreateDashboardToolInputSchema,
    outputSchema: CreateDashboardToolOutputSchema,
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
      "Open the Edit alarm rule form in the chat for one existing rule: its current values, with the changes the user asked for already applied, so the admin can check them and save. All it needs is which rule; the changes are optional ('edit the wet well high level rule' just opens it). It doesn't change the rule itself. A rule's tag can't be changed. To only look at a rule, show its details instead.",
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
      "Open the edit form of one existing device in the chat: its current values, with the changes the user asked for already applied, so the admin can check them and save. Use it to rename a device, move it to another asset, change its status (e.g. into maintenance), firmware or IP address. All it needs is which device; the changes are optional ('edit the PS-01 RTU' just opens it). A status change is also written to the logbook. It doesn't change the device itself. To only look at a device, show its details instead.",
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
      "Open the edit form of one existing tag in the chat: its current values, with the changes the user asked for already applied, so the admin can check them and save. Use it to rename a tag, change its unit, range or log interval, or switch it off. All it needs is which tag; the changes are optional ('edit the inlet pressure tag' just opens it). A tag can't move to another device. It doesn't change the tag itself. To only look at a tag, show its details instead.",
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
  scheduleShift: {
    description:
      "Open the Schedule a shift form in the chat, pre-filled from the request, so the admin can check it and put someone on a shift: on one day, or weekly on chosen weekdays until a date. Call it whenever the user wants to schedule or roster someone, even with no details ('I want to schedule a shift'): every field is optional, and the form opens with the same defaults as on the Shifts page. Don't ask for the person, shift or day first. Nobody can be on two shifts at once: with a person and a shift given, the result lists the shifts of theirs it would overlap. A repeat with no matching day, or too many, is refused. It doesn't schedule anyone itself.",
    inputSchema: ScheduleShiftToolInputSchema,
    outputSchema: ScheduleShiftToolOutputSchema,
  },
  editShift: {
    description:
      "Open the edit form of one scheduled shift in the chat: its current values, with the changes the user asked for already applied, so the admin can check them and save. Use it to hand a shift to someone else, change its role or notes, move it to another day or shift, or change its hours; for a repeating shift, also the rest of its series. It finds the shift by whose it is and the day it starts on (and which shift, if they work two that day); if none or several match, the error lists that person's shifts that day. The changes are optional ('edit Noah's Saturday night' just opens it); the result lists any shift the changes would overlap. To take someone off a shift without handing it to anyone, open the remove confirmation instead. It doesn't change the shift itself.",
    inputSchema: EditShiftToolInputSchema,
    outputSchema: EditShiftToolOutputSchema,
  },
  removeShift: {
    description:
      "Open the Remove shift confirmation of one scheduled shift in the chat, so the admin can check it and remove it: just this shift or, for a repeating one, also the later ones or the whole series. Use it to take someone off a shift without handing it to anyone ('cancel Noah's Saturday night', 'take Liam off nights from Monday'); to give it to someone else, open its edit form instead. It finds the shift by whose it is and the day it starts on (and which shift, if they work two that day); if none or several match, the error lists that person's shifts that day. The slot is left unfilled. It doesn't remove anything itself.",
    inputSchema: RemoveShiftToolInputSchema,
    outputSchema: RemoveShiftToolOutputSchema,
  },
  copyShiftWeek: {
    description:
      "Open the Copy a week form in the chat, pre-filled from the request, so the admin can copy one week's shifts (Monday–Sunday) into the 1 to 8 weeks after it, on the same days and hours: everyone's, or only some people's or some shifts'. Call it whenever the user wants to copy, repeat or roll over a week's schedule ('copy this week to the next two weeks'). Shifts of deactivated people or switched-off shifts are left out, and if any copy would overlap a shift already planned, nothing is copied: the result says how many shifts the copy makes and lists the overlaps. A week with nothing to copy is refused. It doesn't copy anything itself.",
    inputSchema: CopyShiftWeekToolInputSchema,
    outputSchema: CopyShiftWeekToolOutputSchema,
  },
  createShiftTemplate: {
    description:
      "Open the New shift template form in the chat, pre-filled from the request, so the admin can check it and add a kind of shift people can be scheduled on: its name, start, length, colour and staffing targets. Call it whenever the user wants a new shift, even with no details ('add a new shift'): every field is optional, and the form opens with the same defaults as on the Shifts page. Don't ask for anything first. A name another template has, or two staffing rules for one role on the same weekday, is refused. It doesn't add the template itself.",
    inputSchema: CreateShiftTemplateToolInputSchema,
    outputSchema: CreateShiftTemplateToolOutputSchema,
  },
  editShiftTemplate: {
    description:
      "Open the edit form of one shift template in the chat: its current values, with the changes the user asked for already applied, so the admin can check them and save. Use it to rename a shift, change its hours, colour or staffing targets, or switch it off or back on. New hours apply to shifts scheduled from then on; scheduled ones keep theirs. All it needs is which template; the changes are optional ('edit the night shift' just opens it). A name another template has, or two staffing rules for one role on the same weekday, is refused. It doesn't change the template itself.",
    inputSchema: EditShiftTemplateToolInputSchema,
    outputSchema: EditShiftTemplateToolOutputSchema,
  },
  lookup: {
    description:
      "Look up tags, devices or alarm rules with their ids, when that list isn't in your prompt, to fill another tool's id field. It is for you only: the user never sees it. You get every record of the list, as lines like the prompt's own lists, which count as listed. When the user named where, give assetId: you get only the records at that asset and everything below it. For several assets, make one lookup for each, in the same step. Ids an earlier lookup in this chat returned stay valid: reuse them instead of looking up again, and look up again only if a tool says an id is unknown.",
    inputSchema: LookupToolInputSchema,
    outputSchema: LookupToolOutputSchema,
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

/** A dashboard draft inside a message: a `createDashboard` call. */
export type DashboardDraftUIPart = ToolUIPart<Pick<GenUITools, 'createDashboard'>>;

export const isDashboardDraftPart = (part: { type: string }): part is DashboardDraftUIPart =>
  part.type === 'tool-createDashboard';

/** A helper tool's call inside a message: saved and read back by Claude, never drawn. */
export type HelperToolUIPart = ToolUIPart<Pick<GenUITools, HelperToolName>>;

export const isHelperToolPart = (part: { type: string }): part is HelperToolUIPart =>
  HELPER_TOOL_NAMES.some((name) => part.type === `tool-${name}`);

/** Per-message metadata streamed on `start` / `finish`, and saved with the message. */
export interface GenUIMetadata {
  /** The model id that answered (older messages may hold ids no longer offered). */
  model?: string;
  /** The effort level it answered with; absent for models without one. */
  effort?: Effort;
  /**
   * Epoch ms: when an answer started, or when a question was asked (set by the
   * server; Claude's copy of the question starts with it as its session block).
   */
  createdAt?: number;
  /** The mode the answer was given in; the chat keeps rendering it that way. */
  generateUi?: boolean;
  /** AI SDK finish reason; `content-filter` means the model refused. */
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';
}

export type GenUIMessage = UIMessage<GenUIMetadata, Record<string, never>, GenUITools>;
