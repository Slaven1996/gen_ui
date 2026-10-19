import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { tool, type InferUITools } from 'ai';
import {
  addDays,
  FORM_TOOL_NAMES,
  genUiToolSchemas,
  GraphQuerySchema,
  isFormToolName,
  ListAlarmDefinitionsQuerySchema,
  ListAlarmsQuerySchema,
  ListAssetsQuerySchema,
  ListAuditLogsQuerySchema,
  ListDevicesQuerySchema,
  ListLogbookQuerySchema,
  ListTagsQuerySchema,
  ListUsersQuerySchema,
  localPeriod,
  normalizeCoverage,
  OnDutyQuerySchema,
  OPEN_ALARM_STATES,
  SHIFT_TIME_FIELDS,
  ShiftCalendarQuerySchema,
  startOfWeek,
  zonedDate,
  zonedTime,
  type AlarmDefinition,
  type Asset,
  type AssetSnapshot,
  type AssetTreeNode,
  type Device,
  type DeviceSnapshot,
  type EntrySnapshot,
  type FormToolName,
  type GenUIToolName,
  type GenUITools,
  type LogbookEntry,
  type Role,
  type RuleSnapshot,
  type ShiftAssignment,
  type ShiftSnapshot,
  type ShiftTemplate,
  type ShiftTemplateSnapshot,
  type Tag,
  type TagSnapshot,
  type UserRef,
} from '@gen-ui/shared';
import { AlarmDefinitionsService, type AlarmRuleOption } from '../alarms/alarm-definitions.service.js';
import { AlarmsService } from '../alarms/alarms.service.js';
import { AssetsService } from '../assets/assets.service.js';
import { DevicesService, type DeviceOption } from '../assets/devices.service.js';
import { TagsService, type TagOption } from '../assets/tags.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LogbookService, type EntryOption } from '../logbook/logbook.service.js';
import { ShiftsService } from '../shifts/shifts.service.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { UsersService } from '../users/users.service.js';
import { summarizeDashboardDraft } from './dashboard-draft-summary.js';

/** Rows handed to the model per list; the table in the chat pages through the rest itself. */
const ROWS_FOR_MODEL = 20;

/** Longest text handed to the model per row; the table in the chat shows the rest. */
const TEXT_FOR_MODEL = 300;

const clip = (text: string | null) =>
  text && text.length > TEXT_FOR_MODEL ? `${text.slice(0, TEXT_FOR_MODEL - 1)}…` : text;

/** The user's own entries listed for the edit form, newest first; older ones are edited on the Logbook page. */
const OWN_ENTRIES_FOR_MODEL = 30;

/** Shifts handed to the model per calendar: a busy week fits; the calendar in the chat shows the rest. */
const SHIFTS_FOR_MODEL = 60;

/**
 * The choices the pages' pickers offer: the asset tree (`AssetSelect`, from
 * `GET /assets/tree`) and the active people (`UserFilter`, from
 * `GET /users/options`). The system prompt lists them, so Claude fills
 * `assetId`, `authorId`, `actorId` and `userId` with ids a dropdown can show.
 *
 * The other lists are loaded only when a tool on offer takes them, so other
 * prompts stay short: every device, tag and alarm rule (`deviceId`, `tagId`,
 * `tagIds`, `ruleId`: the choices the device and tag pickers offer, the tags
 * a chart or a dashboard draft's widgets show, the records a details card shows and those an admin can
 * open to edit), the user's own latest logbook entries (`entryId`: the ones
 * they may edit), and the shift templates (`templateId`: the Shifts page's
 * Shift dropdown). The details cards are offered to everyone, so devices,
 * tags and rules are in practice always listed.
 * `plantTimeZone` is the zone shift dates are in, for the prompt.
 */
export interface FilterOptions {
  assets: AssetTreeNode[];
  people: UserRef[];
  devices?: DeviceOption[];
  tags?: TagOption[];
  rules?: AlarmRuleOption[];
  entries?: EntryOption[];
  shiftTemplates?: ShiftTemplate[];
  plantTimeZone: string;
}

/** The forms by role: the system prompt says what to do when the user asks for one. */
export interface FormAccess {
  /** Forms this user's role may open (only offered with components on). */
  allowed: FormToolName[];
  /** Forms only other roles may open, and those roles. */
  denied: { name: FormToolName; roles: readonly Role[] }[];
}

/**
 * Claude copies ids from the lists in its prompt. A miscopied id would
 * quietly filter everything out, or open the wrong record in a form, so the
 * tool refuses it; Claude reads the error and tries again.
 */
function idChecks({ assets, people, devices, tags, rules, entries, shiftTemplates }: FilterOptions) {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const templatesById = new Map(shiftTemplates?.map((template) => [template.id, template]));
  const devicesById = new Map(devices?.map((device) => [device.id, device]));
  const tagsById = new Map(tags?.map((tag) => [tag.id, tag]));
  const rulesById = new Map(rules?.map((rule) => [rule.id, rule]));
  const entriesById = new Map(entries?.map((entry) => [entry.id, entry]));
  // `null` is a form's "none" (no parent, no asset): nothing to check.
  const asset = (id: string | null | undefined): AssetTreeNode | undefined => {
    if (id === undefined || id === null) return undefined;
    const node = assetsById.get(id);
    if (!node) throw new Error(`Unknown asset id ${id}: use an id from the asset list.`);
    return node;
  };
  const person = (id: string): UserRef => {
    const found = peopleById.get(id);
    if (!found) throw new Error(`Unknown person id ${id}: use an id from the people list.`);
    return found;
  };
  const template = (id: string): ShiftTemplate => {
    const found = templatesById.get(id);
    if (!found) throw new Error(`Unknown shift template id ${id}: use an id from the shift template list.`);
    return found;
  };
  return {
    asset,
    /** A new parent for `assetId`: a listed asset, and neither that asset nor anything below it. */
    newParent(assetId: string, parentId: string | null | undefined): void {
      // Walk up from the new parent; meeting the asset means it would end up below itself.
      for (let node = asset(parentId); node; node = node.parentId ? assetsById.get(node.parentId) : undefined) {
        if (node.id === assetId) {
          throw new Error("An asset can't move under itself or anything below it: choose another parent.");
        }
      }
    },
    person,
    people(ids: string[] | undefined): void {
      for (const id of ids ?? []) person(id);
    },
    template,
    templates(ids: string[] | undefined): void {
      for (const id of ids ?? []) template(id);
    },
    /** A template people can be scheduled on: the forms' Shift dropdowns list only active ones. */
    activeTemplate(id: string): ShiftTemplate {
      const found = template(id);
      if (!found.isActive) {
        throw new Error(`The shift ${found.name} is switched off, so nobody can be scheduled on it: choose an active one.`);
      }
      return found;
    },
    rule(id: string): AlarmRuleOption {
      const rule = rulesById.get(id);
      if (!rule) throw new Error(`Unknown alarm rule id ${id}: use an id from the alarm rule list.`);
      return rule;
    },
    tag(id: string): TagOption {
      const tag = tagsById.get(id);
      if (!tag) throw new Error(`Unknown tag id ${id}: use an id from the tag list.`);
      return tag;
    },
    device(id: string): DeviceOption {
      const device = devicesById.get(id);
      if (!device) throw new Error(`Unknown device id ${id}: use an id from the device list.`);
      return device;
    },
    entry(id: string): EntryOption {
      const entry = entriesById.get(id);
      if (!entry) {
        throw new Error(
          `Unknown entry id ${id}: use an id from the list of the user's own entries. Only its author can edit an entry.`,
        );
      }
      return entry;
    },
  };
}

/** What a form tool returns: its contract's output, so the optional `outcome` stays in the type. */
type FormOutput<N extends FormToolName> = GenUITools[N]['output'];

/** A rule's values as the edit form opens on them; `recordOutcome` diffs the saved rule against this. */
export function toRuleSnapshot(rule: AlarmDefinition): RuleSnapshot {
  return {
    name: rule.name,
    description: rule.description,
    tag: rule.tag.name,
    unit: rule.tag.unit,
    asset: rule.asset.name,
    condition: rule.condition,
    threshold: rule.threshold,
    deadband: rule.deadband,
    severity: rule.severity,
    isEnabled: rule.isEnabled,
  };
}

/** A device's values as the edit form opens on them; `recordOutcome` diffs the saved device against this. */
export function toDeviceSnapshot(device: Device): DeviceSnapshot {
  return {
    name: device.name,
    serialNumber: device.serialNumber,
    asset: device.asset.name,
    model: device.model,
    manufacturer: device.manufacturer,
    protocol: device.protocol,
    status: device.status,
    firmwareVersion: device.firmwareVersion,
    ipAddress: device.ipAddress,
    // The day, as the form's date field shows it.
    installedAt: device.installedAt?.slice(0, 10) ?? null,
  };
}

/** A tag's values as the edit form opens on them; `recordOutcome` diffs the saved tag against this. */
export function toTagSnapshot(tag: Tag): TagSnapshot {
  return {
    name: tag.name,
    code: tag.code,
    device: tag.device.name,
    asset: tag.asset.name,
    description: tag.description,
    unit: tag.unit,
    dataType: tag.dataType,
    minValue: tag.minValue,
    maxValue: tag.maxValue,
    logIntervalSeconds: tag.logIntervalSeconds,
    isActive: tag.isActive,
  };
}

/** An asset's values as the edit form opens on them; `recordOutcome` diffs the saved asset against this. */
export function toAssetSnapshot(asset: Asset): AssetSnapshot {
  return {
    name: asset.name,
    code: asset.code,
    type: asset.type,
    parent: asset.parent?.name ?? null,
    description: asset.description,
    address: asset.address,
    latitude: asset.latitude,
    longitude: asset.longitude,
    isActive: asset.isActive,
  };
}

/** An entry's values as the edit form opens on them; `recordOutcome` diffs the saved entry against this. */
export function toEntrySnapshot(entry: LogbookEntry): EntrySnapshot {
  return {
    category: entry.category,
    severity: entry.severity,
    title: entry.title,
    body: entry.body,
    asset: entry.asset?.name ?? null,
    occurredAt: entry.occurredAt,
  };
}

/**
 * A shift's values as the edit form opens on them, on the plant's clock
 * (`timeZone`); `recordOutcome` diffs the saved shift against this.
 */
export function toShiftSnapshot(shift: ShiftAssignment, timeZone: string): ShiftSnapshot {
  const local = localPeriod(shift.startsAt, shift.endsAt, timeZone);
  return {
    person: shift.user.name,
    shift: shift.template.name,
    role: shift.role,
    date: local.date,
    start: local.startTime,
    hours: local.durationMinutes / 60,
    notes: shift.notes,
  };
}

/** A template's values as the edit form opens on them; `recordOutcome` diffs the saved template against this. */
export function toShiftTemplateSnapshot(template: ShiftTemplate): ShiftTemplateSnapshot {
  return {
    name: template.name,
    startTime: template.startTime,
    durationMinutes: template.durationMinutes,
    color: template.color,
    isActive: template.isActive,
    // In a stable order, so equal staffing compares equal.
    coverage: normalizeCoverage(template.coverage),
  };
}

/**
 * Who may use each tool: the `@Roles` of the endpoint the tool mirrors. HTTP
 * guards don't run for tool calls, so this map is the tools' authorization.
 * `satisfies` makes every tool declare its roles. A tool limited to admins
 * also checks the role inside `execute`, in case this map and the check ever
 * drift apart.
 */
const TOOL_ROLES = {
  listUsers: ['ADMIN', 'USER'],
  listAlarmRules: ['ADMIN', 'USER'],
  listAuditLogs: ['ADMIN'],
  listAlarms: ['ADMIN', 'USER'],
  listLogbookEntries: ['ADMIN', 'USER'],
  showShiftCalendar: ['ADMIN', 'USER'],
  showOnDuty: ['ADMIN', 'USER'],
  listDevices: ['ADMIN', 'USER'],
  listTags: ['ADMIN', 'USER'],
  listAssets: ['ADMIN', 'USER'],
  plotTags: ['ADMIN', 'USER'],
  showAlarm: ['ADMIN', 'USER'],
  showAlarmRule: ['ADMIN', 'USER'],
  showDevice: ['ADMIN', 'USER'],
  showTag: ['ADMIN', 'USER'],
  createDashboard: ['ADMIN', 'USER'],
  createUser: ['ADMIN'],
  createAlarmRule: ['ADMIN'],
  editAlarmRule: ['ADMIN'],
  createDevice: ['ADMIN'],
  editDevice: ['ADMIN'],
  createTag: ['ADMIN'],
  editTag: ['ADMIN'],
  createAsset: ['ADMIN'],
  editAsset: ['ADMIN'],
  createLogbookEntry: ['ADMIN', 'USER'],
  editLogbookEntry: ['ADMIN', 'USER'],
  scheduleShift: ['ADMIN'],
  editShift: ['ADMIN'],
  copyShiftWeek: ['ADMIN'],
  createShiftTemplate: ['ADMIN'],
  editShiftTemplate: ['ADMIN'],
} as const satisfies Record<GenUIToolName, readonly Role[]>;

/** Whether this user's role may use the tool (also checked when a form's outcome is recorded). */
export function mayUse(user: AuthUser, name: GenUIToolName): boolean {
  return (TOOL_ROLES[name] as readonly Role[]).includes(user.role);
}

/**
 * The assistant's tools. Like controllers, they are adapters: each one turns
 * a tool call into a call on a domain service, so the chat gets the same
 * rules and mapping as the REST API. Tools never call a controller or a
 * repository. A new domain adds its tool here, with its contract in
 * @gen-ui/shared, and injects that domain's service.
 *
 * [AI]  Claude decides to call a tool and writes its input (the filters).
 * [app] Everything in `execute` is ordinary code: the input is validated by
 *       the SDK against the shared schema, then again as a page query, and
 *       the service runs the same query the REST endpoint would.
 */
@Injectable()
export class AiTools {
  constructor(
    private readonly users: UsersService,
    private readonly alarmRules: AlarmDefinitionsService,
    private readonly audit: AuditService,
    private readonly alarms: AlarmsService,
    private readonly logbook: LogbookService,
    private readonly devices: DevicesService,
    private readonly tags: TagsService,
    private readonly assets: AssetsService,
    private readonly telemetry: TelemetryService,
    private readonly shifts: ShiftsService,
  ) {}

  /**
   * The pickers' options, for the system prompt and for `create`. A list
   * beyond assets and people is loaded only when one of the `active` tools
   * takes it; `user`'s own entries are the ones they may edit.
   */
  async filterOptions(user: AuthUser, active: GenUIToolName[]): Promise<FilterOptions> {
    const takenBy = (...names: GenUIToolName[]) => names.some((name) => active.includes(name));
    const [assets, people, devices, tags, rules, entries, shiftTemplates] = await Promise.all([
      this.assets.tree(),
      this.users.options(),
      takenBy('showDevice', 'editDevice', 'createTag') ? this.devices.options() : undefined,
      takenBy('showTag', 'createAlarmRule', 'editTag', 'plotTags', 'createDashboard') ? this.tags.options() : undefined,
      takenBy('showAlarmRule', 'editAlarmRule') ? this.alarmRules.options() : undefined,
      takenBy('editLogbookEntry') ? this.logbook.options(user.id, OWN_ENTRIES_FOR_MODEL) : undefined,
      takenBy('showShiftCalendar', 'scheduleShift', 'editShift', 'copyShiftWeek', 'editShiftTemplate')
        ? this.shifts.listTemplates()
        : undefined,
    ]);
    return { assets, people, devices, tags, rules, entries, shiftTemplates, plantTimeZone: this.shifts.timeZone };
  }

  /**
   * A fresh tool set per request; `execute` is what the AI SDK runs for each
   * call. `user` is who is asking. `timeZone` is theirs, so a date Claude
   * takes from their words ("signed in yesterday") means the same day the
   * web app's table shows. `options` are the asset and people lists Claude
   * was given; ids it writes must come from them.
   */
  create({ user, timeZone, options }: { user: AuthUser; timeZone: string; options: FilterOptions }) {
    const known = idChecks(options);
    // Shift dates and times are the plant's, whatever the user's zone.
    const plantZone = options.plantTimeZone;
    // TOOL_ROLES already keeps admin-only tools from everyone else; this is the second lock.
    const adminOnly = (what: string) => {
      if (user.role !== 'ADMIN') throw new ForbiddenException(`${what} is for admins only.`);
    };
    return {
      listUsers: tool({
        ...genUiToolSchemas.listUsers,
        // `title` only labels the table; the rest is the `/users` query.
        execute: async ({ title: _title, ...filters }) => {
          const query = ListUsersQuerySchema.parse({ ...filters, timeZone, pageSize: ROWS_FOR_MODEL });
          const page = await this.users.list(query);
          // What Claude reads back: enough to answer "how many" and name a few.
          return {
            total: page.total,
            users: page.items.map(({ name, email, role, isActive, lastLoginAt }) => ({
              name,
              email,
              role,
              isActive,
              lastLoginAt,
            })),
          };
        },
      }),

      listAlarmRules: tool({
        ...genUiToolSchemas.listAlarmRules,
        // `title` only labels the table; the rest is the `/alarm-rules` query.
        execute: async ({ title: _title, ...filters }) => {
          known.asset(filters.assetId);
          const query = ListAlarmDefinitionsQuerySchema.parse({ ...filters, pageSize: ROWS_FOR_MODEL });
          const page = await this.alarmRules.list(query);
          // Names instead of ids: Claude talks about the rule, its tag and where it is.
          return {
            total: page.total,
            rules: page.items.map((rule) => ({
              name: rule.name,
              tag: rule.tag.name,
              unit: rule.tag.unit,
              asset: rule.asset.name,
              condition: rule.condition,
              threshold: rule.threshold,
              deadband: rule.deadband,
              severity: rule.severity,
              isEnabled: rule.isEnabled,
              openAlarmCount: rule.openAlarmCount,
            })),
          };
        },
      }),

      listAuditLogs: tool({
        ...genUiToolSchemas.listAuditLogs,
        // `title` only labels the table; the rest is the `/audit` query.
        execute: async ({ title: _title, ...filters }) => {
          adminOnly('The audit log');
          known.people(filters.actorId);
          const query = ListAuditLogsQuerySchema.parse({ ...filters, pageSize: ROWS_FOR_MODEL });
          const page = await this.audit.list(query);
          return {
            total: page.total,
            records: page.items.map(({ createdAt, actor, action, summary, changes }) => ({
              createdAt,
              actor: actor?.name ?? null,
              action,
              summary,
              changes,
            })),
          };
        },
      }),

      listAlarms: tool({
        ...genUiToolSchemas.listAlarms,
        // `title` only labels the table; the rest is the `/alarms` query.
        execute: async ({ title: _title, ...filters }) => {
          known.asset(filters.assetId);
          const query = ListAlarmsQuerySchema.parse({ ...filters, pageSize: ROWS_FOR_MODEL });
          const page = await this.alarms.list(query);
          // The message already names the rule, the tag, the limit and the reading.
          return {
            total: page.total,
            alarms: page.items.map((alarm) => ({
              id: alarm.id,
              message: alarm.message,
              severity: alarm.severity,
              state: alarm.state,
              asset: alarm.asset.name,
              raisedAt: alarm.raisedAt,
              clearedAt: alarm.clearedAt,
              acknowledgedBy: alarm.acknowledgedBy?.name ?? null,
            })),
          };
        },
      }),

      listLogbookEntries: tool({
        ...genUiToolSchemas.listLogbookEntries,
        // `title` only labels the table; the rest is the `/logbook` query.
        execute: async ({ title: _title, ...filters }) => {
          known.asset(filters.assetId);
          known.people(filters.authorId);
          const query = ListLogbookQuerySchema.parse({ ...filters, pageSize: ROWS_FOR_MODEL });
          const page = await this.logbook.list(query);
          return {
            total: page.total,
            entries: page.items.map((entry) => ({
              occurredAt: entry.occurredAt,
              category: entry.category,
              severity: entry.severity,
              title: entry.title,
              body: clip(entry.body),
              asset: entry.asset?.name ?? null,
              author: entry.author?.name ?? null,
            })),
          };
        },
      }),

      showShiftCalendar: tool({
        ...genUiToolSchemas.showShiftCalendar,
        // `title` only labels the calendar and `group` only lays out its week; the rest is the `/shifts/calendar` query.
        execute: async ({ title: _title, group: _group, ...filters }) => {
          known.people(filters.userId);
          known.templates(filters.templateId);
          const calendar = await this.shifts.calendar(ShiftCalendarQuerySchema.parse(filters));
          const zone = calendar.timeZone;
          // Each shift under the day it starts, as the calendar files it: not the night that began the evening before.
          const shifts = calendar.items.filter((item) => item.date >= calendar.from && item.date <= calendar.to);
          const templateNames = new Map(calendar.templates.map((template) => [template.id, template.name]));
          return {
            timeZone: zone,
            view: calendar.view,
            from: calendar.from,
            to: calendar.to,
            total: shifts.length,
            shifts: shifts.slice(0, SHIFTS_FOR_MODEL).map((shift) => ({
              date: shift.date,
              shift: shift.template.name,
              start: zonedTime(shift.startsAt, zone),
              end: zonedTime(shift.endsAt, zone),
              person: shift.user.name,
              role: shift.role,
              notes: clip(shift.notes),
            })),
            gaps: calendar.coverage
              .filter((entry) => entry.filled < entry.required)
              .map((entry) => ({
                date: entry.date,
                shift: templateNames.get(entry.templateId) ?? entry.templateId,
                role: entry.role,
                missing: entry.required - entry.filled,
              })),
          };
        },
      }),

      showOnDuty: tool({
        ...genUiToolSchemas.showOnDuty,
        // `when` picks one half of the on-duty strip; `role` is its query.
        execute: async ({ when, role }) => {
          const onDuty = await this.shifts.onDuty(OnDutyQuerySchema.parse({ role }));
          const zone = onDuty.timeZone;
          const at = (instant: string) => `${zonedDate(instant, zone)} ${zonedTime(instant, zone)}`;
          return {
            when,
            timeZone: zone,
            people: (when === 'now' ? onDuty.items : onDuty.next).map((shift) => ({
              name: shift.user.name,
              role: shift.role,
              shift: shift.template.name,
              from: at(shift.startsAt),
              until: at(shift.endsAt),
            })),
          };
        },
      }),

      listDevices: tool({
        ...genUiToolSchemas.listDevices,
        // `title` only labels the table; the rest is the `/devices` query.
        execute: async ({ title: _title, ...filters }) => {
          known.asset(filters.assetId);
          const query = ListDevicesQuerySchema.parse({ ...filters, pageSize: ROWS_FOR_MODEL });
          const page = await this.devices.list(query);
          return {
            total: page.total,
            devices: page.items.map((device) => ({
              name: device.name,
              serialNumber: device.serialNumber,
              model: device.model,
              manufacturer: device.manufacturer,
              protocol: device.protocol,
              status: device.status,
              asset: device.asset.name,
              lastSeenAt: device.lastSeenAt,
              tagCount: device.tagCount,
            })),
          };
        },
      }),

      listTags: tool({
        ...genUiToolSchemas.listTags,
        // `title` only labels the table; the rest is the `/tags` query.
        execute: async ({ title: _title, ...filters }) => {
          known.asset(filters.assetId);
          const query = ListTagsQuerySchema.parse({ ...filters, pageSize: ROWS_FOR_MODEL });
          const page = await this.tags.list(query);
          return {
            total: page.total,
            tags: page.items.map((tag) => ({
              name: tag.name,
              code: tag.code,
              unit: tag.unit,
              dataType: tag.dataType,
              lastValue: tag.lastValue,
              lastValueAt: tag.lastValueAt,
              minValue: tag.minValue,
              maxValue: tag.maxValue,
              device: tag.device.name,
              asset: tag.asset.name,
            })),
          };
        },
      }),

      listAssets: tool({
        ...genUiToolSchemas.listAssets,
        // `title` only labels the table; the rest is the `/assets` query.
        execute: async ({ title: _title, ...filters }) => {
          known.asset(filters.ancestorId);
          known.asset(filters.parentId);
          const query = ListAssetsQuerySchema.parse({ ...filters, pageSize: ROWS_FOR_MODEL });
          const page = await this.assets.list(query);
          // The tree in `options` already rolls open alarms up to every asset.
          const openAlarms = new Map(options.assets.map((node) => [node.id, node.openAlarmCount]));
          return {
            total: page.total,
            assets: page.items.map((asset) => ({
              name: asset.name,
              code: asset.code,
              type: asset.type,
              parent: asset.parent?.name ?? null,
              isActive: asset.isActive,
              description: clip(asset.description),
              address: asset.address,
              childCount: asset.childCount,
              deviceCount: asset.deviceCount,
              openAlarmCount: openAlarms.get(asset.id) ?? 0,
            })),
          };
        },
      }),

      plotTags: tool({
        ...genUiToolSchemas.plotTags,
        // `title` only labels the chart; the rest is the `/graphs` query.
        execute: async ({ title: _title, ...filters }) => {
          const query = GraphQuerySchema.parse(filters);
          const tags = (query.tagIds ?? []).map((id) => known.tag(id));
          // The chart fetches its own buckets; Claude reads a summary of each tag's window.
          const { interval } = this.telemetry.window(query);
          // In `tagIds` order, one row per tag.
          const stats = await this.telemetry.stats(query);
          return {
            interval,
            tags: tags.map((tag, index) => {
              const { count, min, max, avg, last, lastAt } = stats[index];
              return { name: tag.name, unit: tag.unit, asset: tag.asset, count, min, max, avg, last, lastAt };
            }),
          };
        },
      }),

      // ─── Details ─────────────────────────────────────────────────────────
      // One record as the details card its page opens on a row click. The
      // card loads the record itself, like the page; Claude reads the same
      // record, with names instead of ids, to answer about it.

      showAlarm: tool({
        ...genUiToolSchemas.showAlarm,
        execute: async ({ alarmId }) => {
          // Alarms have no pick list: the id comes from an alarm list earlier in the chat.
          const alarm = await this.alarms.get(alarmId).catch((error: unknown) => {
            if (error instanceof NotFoundException) {
              throw new Error(`Unknown alarm id ${alarmId}: find the alarms first and use an id from that result.`);
            }
            throw error;
          });
          return {
            alarm: {
              message: alarm.message,
              rule: alarm.definition.name,
              tag: alarm.tag.name,
              unit: alarm.tag.unit,
              asset: alarm.asset.name,
              severity: alarm.severity,
              state: alarm.state,
              triggerValue: alarm.triggerValue,
              clearValue: alarm.clearValue,
              raisedAt: alarm.raisedAt,
              clearedAt: alarm.clearedAt,
              acknowledgedAt: alarm.acknowledgedAt,
              acknowledgedBy: alarm.acknowledgedBy?.name ?? null,
              acknowledgeNote: clip(alarm.acknowledgeNote),
            },
          };
        },
      }),

      showAlarmRule: tool({
        ...genUiToolSchemas.showAlarmRule,
        execute: async ({ ruleId }) => {
          known.rule(ruleId);
          const rule = await this.alarmRules.get(ruleId);
          return {
            rule: { ...toRuleSnapshot(rule), description: clip(rule.description), openAlarmCount: rule.openAlarmCount },
          };
        },
      }),

      showDevice: tool({
        ...genUiToolSchemas.showDevice,
        execute: async ({ deviceId }) => {
          known.device(deviceId);
          const device = await this.devices.get(deviceId);
          return { device: { ...toDeviceSnapshot(device), lastSeenAt: device.lastSeenAt, tagCount: device.tagCount } };
        },
      }),

      showTag: tool({
        ...genUiToolSchemas.showTag,
        execute: async ({ tagId }) => {
          known.tag(tagId);
          // The counts the card links to: the rules watching the tag, and its open alarms.
          const [tag, rules, openAlarms] = await Promise.all([
            this.tags.get(tagId),
            this.alarmRules.list(ListAlarmDefinitionsQuerySchema.parse({ tagId, pageSize: 1 })),
            this.alarms.list(ListAlarmsQuerySchema.parse({ tagId, state: [...OPEN_ALARM_STATES], pageSize: 1 })),
          ]);
          return {
            tag: {
              ...toTagSnapshot(tag),
              description: clip(tag.description),
              lastValue: tag.lastValue,
              lastValueAt: tag.lastValueAt,
              alarmRules: rules.total,
              openAlarms: openAlarms.total,
            },
          };
        },
      }),

      // ─── Dashboards ──────────────────────────────────────────────────────
      // A dashboard draft: the chat previews it with the page's own grid,
      // and the user saves it on the Dashboard page. Like a form, it never
      // writes; whether it was saved is read from the dashboards themselves
      // (DashboardDraftsService), not recorded on the call.

      createDashboard: tool({
        ...genUiToolSchemas.createDashboard,
        // What each widget shows by name and still lacks; an id not on the lists, or a
        // field its type doesn't take, throws for Claude to correct.
        execute: async (input) => summarizeDashboardDraft(input, known),
      }),

      // ─── Forms ───────────────────────────────────────────────────────────
      // A form tool only opens the form: the input is the pre-fill, and the
      // user saves through the REST endpoint the modal uses. The schemas
      // already hold the pre-fill to the form's limits; `execute` checks the
      // ids and who is asking, and hands Claude what it needs to describe
      // the form in a sentence.

      createUser: tool({
        ...genUiToolSchemas.createUser,
        execute: async (): Promise<FormOutput<'createUser'>> => {
          adminOnly('Adding users');
          return { status: 'opened' as const };
        },
      }),

      createAlarmRule: tool({
        ...genUiToolSchemas.createAlarmRule,
        execute: async ({ tagId }): Promise<FormOutput<'createAlarmRule'>> => {
          adminOnly('Creating alarm rules');
          const tag = tagId === undefined ? null : known.tag(tagId);
          return {
            status: 'opened' as const,
            tag: tag && { name: tag.name, code: tag.code, unit: tag.unit, asset: tag.asset },
          };
        },
      }),

      editAlarmRule: tool({
        ...genUiToolSchemas.editAlarmRule,
        execute: async ({ ruleId }): Promise<FormOutput<'editAlarmRule'>> => {
          adminOnly('Editing alarm rules');
          known.rule(ruleId);
          // The form loads the rule again itself; this copy is for Claude, and for the outcome's diff.
          return { status: 'opened' as const, rule: toRuleSnapshot(await this.alarmRules.get(ruleId)) };
        },
      }),

      createDevice: tool({
        ...genUiToolSchemas.createDevice,
        execute: async ({ assetId }): Promise<FormOutput<'createDevice'>> => {
          adminOnly('Registering devices');
          return { status: 'opened' as const, asset: known.asset(assetId)?.name ?? null };
        },
      }),

      editDevice: tool({
        ...genUiToolSchemas.editDevice,
        execute: async ({ deviceId, changes }): Promise<FormOutput<'editDevice'>> => {
          adminOnly('Editing devices');
          known.device(deviceId);
          known.asset(changes?.assetId);
          // The form loads the device again itself; this copy is for Claude, and for the outcome's diff.
          return { status: 'opened' as const, device: toDeviceSnapshot(await this.devices.get(deviceId)) };
        },
      }),

      createTag: tool({
        ...genUiToolSchemas.createTag,
        execute: async ({ deviceId }): Promise<FormOutput<'createTag'>> => {
          adminOnly('Adding tags');
          const device = deviceId === undefined ? null : known.device(deviceId);
          return { status: 'opened' as const, device: device && { name: device.name, asset: device.asset } };
        },
      }),

      editTag: tool({
        ...genUiToolSchemas.editTag,
        execute: async ({ tagId }): Promise<FormOutput<'editTag'>> => {
          adminOnly('Editing tags');
          known.tag(tagId);
          // The form loads the tag again itself; this copy is for Claude, and for the outcome's diff.
          return { status: 'opened' as const, tag: toTagSnapshot(await this.tags.get(tagId)) };
        },
      }),

      createAsset: tool({
        ...genUiToolSchemas.createAsset,
        execute: async ({ parentId }): Promise<FormOutput<'createAsset'>> => {
          adminOnly('Adding assets');
          return { status: 'opened' as const, parent: known.asset(parentId)?.name ?? null };
        },
      }),

      editAsset: tool({
        ...genUiToolSchemas.editAsset,
        execute: async ({ assetId, changes }): Promise<FormOutput<'editAsset'>> => {
          adminOnly('Editing assets');
          known.asset(assetId);
          known.newParent(assetId, changes?.parentId);
          // The form loads the asset again itself; this copy is for Claude, and for the outcome's diff.
          return { status: 'opened' as const, asset: toAssetSnapshot(await this.assets.get(assetId)) };
        },
      }),

      // Anyone signed in may write in the logbook, so there is no role to check.
      createLogbookEntry: tool({
        ...genUiToolSchemas.createLogbookEntry,
        execute: async ({ assetId }): Promise<FormOutput<'createLogbookEntry'>> => {
          return { status: 'opened' as const, asset: known.asset(assetId)?.name ?? null };
        },
      }),

      editLogbookEntry: tool({
        ...genUiToolSchemas.editLogbookEntry,
        execute: async ({ entryId, changes }): Promise<FormOutput<'editLogbookEntry'>> => {
          known.entry(entryId);
          known.asset(changes?.assetId);
          const entry = await this.logbook.get(entryId);
          // The list holds only the user's own entries; this is the second lock, as on PATCH /logbook/:id.
          if (entry.author?.id !== user.id) throw new ForbiddenException('Only its author can edit an entry.');
          // The form loads the entry again itself; this copy is for Claude, and for the outcome's diff.
          return { status: 'opened' as const, entry: toEntrySnapshot(entry) };
        },
      }),

      scheduleShift: tool({
        ...genUiToolSchemas.scheduleShift,
        execute: async ({ userId, templateId }): Promise<FormOutput<'scheduleShift'>> => {
          adminOnly('Scheduling shifts');
          return {
            status: 'opened' as const,
            person: userId === undefined ? null : known.person(userId).name,
            shift: templateId === undefined ? null : known.activeTemplate(templateId).name,
            timeZone: plantZone,
          };
        },
      }),

      editShift: tool({
        ...genUiToolSchemas.editShift,
        execute: async ({ userId, date, templateId, scope = 'one', changes }): Promise<FormOutput<'editShift'>> => {
          adminOnly('Editing shifts');
          const person = known.person(userId);
          if (templateId !== undefined) known.template(templateId);
          if (changes?.userId !== undefined) known.person(changes.userId);
          if (changes?.templateId !== undefined) known.activeTemplate(changes.templateId);

          // The shift is named by whose it is and the day it starts: one match, or Claude hears what there is.
          const found = await this.shifts.findStarting({ userId, date, templateId });
          if (found.length !== 1) {
            const thatDay = templateId === undefined ? found : await this.shifts.findStarting({ userId, date });
            const hours = (shift: ShiftAssignment) =>
              `${zonedTime(shift.startsAt, plantZone)}–${zonedTime(shift.endsAt, plantZone)}`;
            const listed = thatDay
              .map((shift) => `${shift.template.name} ${hours(shift)} (template id ${shift.template.id})`)
              .join('; ');
            throw new Error(
              found.length === 0
                ? `${person.name} has no ${templateId === undefined ? '' : 'such '}shift starting on ${date}${listed ? `. That day they have: ${listed}` : ''}.`
                : `${person.name} has ${found.length} shifts starting on ${date}: ${listed}. Call again with the templateId of the one meant.`,
            );
          }
          const shift = found[0];

          // A shift outside a series is its own whole series; the service only moves one shift in time at once.
          const effectiveScope = shift.seriesId ? scope : 'one';
          if (effectiveScope !== 'one' && SHIFT_TIME_FIELDS.some((field) => changes?.[field] !== undefined)) {
            throw new Error(
              'A new day, shift or hours applies to one shift at a time: use scope one, or change only the person, role or notes.',
            );
          }
          // The form loads the shift again itself; this copy is for Claude, and for the outcome's diff.
          return {
            status: 'opened' as const,
            shiftId: shift.id,
            timeZone: plantZone,
            repeats: shift.seriesId !== null,
            scope: effectiveScope,
            shift: toShiftSnapshot(shift, plantZone),
          };
        },
      }),

      copyShiftWeek: tool({
        ...genUiToolSchemas.copyShiftWeek,
        execute: async ({ week, userId, templateId }): Promise<FormOutput<'copyShiftWeek'>> => {
          adminOnly('Copying shifts');
          // Without a day, this week on the plant's calendar, as the page's Copy week button would copy.
          const monday = startOfWeek(week ?? zonedDate(new Date(), plantZone));
          return {
            status: 'opened' as const,
            week: { from: monday, to: addDays(monday, 6) },
            people: userId?.map((id) => known.person(id).name) ?? null,
            shifts: templateId?.map((id) => known.template(id).name) ?? null,
          };
        },
      }),

      createShiftTemplate: tool({
        ...genUiToolSchemas.createShiftTemplate,
        execute: async (): Promise<FormOutput<'createShiftTemplate'>> => {
          adminOnly('Adding shift templates');
          return { status: 'opened' as const };
        },
      }),

      editShiftTemplate: tool({
        ...genUiToolSchemas.editShiftTemplate,
        execute: async ({ templateId }): Promise<FormOutput<'editShiftTemplate'>> => {
          adminOnly('Editing shift templates');
          known.template(templateId);
          // The form loads the template again itself; this copy is for Claude, and for the outcome's diff.
          return {
            status: 'opened' as const,
            template: toShiftTemplateSnapshot(await this.shifts.getTemplate(templateId)),
          };
        },
      }),
    };
  }

  /**
   * The tools this user may call. The model is never offered the others.
   * Form tools need components: in a text-only answer there is no form to show.
   */
  activeFor(user: AuthUser, generateUi: boolean): GenUIToolName[] {
    return (Object.keys(TOOL_ROLES) as GenUIToolName[]).filter(
      (name) => mayUse(user, name) && (generateUi || !isFormToolName(name)),
    );
  }

  /**
   * Which forms this user's role may open, whether or not components are on,
   * and which only other roles may. The prompt names both, by their titles.
   */
  formsFor(user: AuthUser): FormAccess {
    return {
      allowed: FORM_TOOL_NAMES.filter((name) => mayUse(user, name)),
      denied: FORM_TOOL_NAMES.filter((name) => !mayUse(user, name)).map((name) => ({ name, roles: TOOL_ROLES[name] })),
    };
  }
}

export type AiToolSet = ReturnType<AiTools['create']>;

// Compile-time guard: the tools the backend executes must match the shared
// contract the frontend renders. A mismatch fails `tsc` here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const toolContractInSync: Same<InferUITools<AiToolSet>, GenUITools> = true;
void toolContractInSync;
