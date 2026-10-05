import { ForbiddenException, Injectable } from '@nestjs/common';
import { tool, type InferUITools } from 'ai';
import {
  FORM_TOOL_NAMES,
  genUiToolSchemas,
  isFormToolName,
  ListAlarmDefinitionsQuerySchema,
  ListAlarmsQuerySchema,
  ListAssetsQuerySchema,
  ListAuditLogsQuerySchema,
  ListDevicesQuerySchema,
  ListLogbookQuerySchema,
  ListTagsQuerySchema,
  ListUsersQuerySchema,
  type AlarmDefinition,
  type AssetTreeNode,
  type Device,
  type DeviceSnapshot,
  type FormToolName,
  type GenUIToolName,
  type GenUITools,
  type Role,
  type RuleSnapshot,
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
import { LogbookService } from '../logbook/logbook.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { UsersService } from '../users/users.service.js';

/** Rows handed to the model per list; the table in the chat pages through the rest itself. */
const ROWS_FOR_MODEL = 20;

/** Longest text handed to the model per row; the table in the chat shows the rest. */
const TEXT_FOR_MODEL = 300;

const clip = (text: string | null) =>
  text && text.length > TEXT_FOR_MODEL ? `${text.slice(0, TEXT_FOR_MODEL - 1)}…` : text;

/**
 * The choices the pages' pickers offer: the asset tree (`AssetSelect`, from
 * `GET /assets/tree`) and the active people (`UserFilter`, from
 * `GET /users/options`). The system prompt lists them, so Claude fills
 * `assetId`, `authorId` and `actorId` with ids a dropdown can show.
 */
export interface FilterOptions {
  assets: AssetTreeNode[];
  people: UserRef[];
  /**
   * Every device, tag and alarm rule, for the form tools (`deviceId`,
   * `tagId`, `ruleId`): the choices the device and tag pickers offer, and the
   * records a user can open to edit. Loaded only when those tools are on
   * offer, so other prompts stay short.
   */
  forms?: { devices: DeviceOption[]; tags: TagOption[]; rules: AlarmRuleOption[] };
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
function idChecks({ assets, people, forms }: FilterOptions) {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const peopleIds = new Set(people.map((person) => person.id));
  const devices = new Map(forms?.devices.map((device) => [device.id, device]));
  const tags = new Map(forms?.tags.map((tag) => [tag.id, tag]));
  const rules = new Map(forms?.rules.map((rule) => [rule.id, rule]));
  return {
    asset(id: string | undefined): AssetTreeNode | undefined {
      if (id === undefined) return undefined;
      const asset = assetsById.get(id);
      if (!asset) throw new Error(`Unknown asset id ${id}: use an id from the asset list.`);
      return asset;
    },
    people(ids: string[] | undefined): void {
      const unknown = ids?.find((id) => !peopleIds.has(id));
      if (unknown) throw new Error(`Unknown person id ${unknown}: use an id from the people list.`);
    },
    rule(id: string): AlarmRuleOption {
      const rule = rules.get(id);
      if (!rule) throw new Error(`Unknown alarm rule id ${id}: use an id from the alarm rule list.`);
      return rule;
    },
    tag(id: string): TagOption {
      const tag = tags.get(id);
      if (!tag) throw new Error(`Unknown tag id ${id}: use an id from the tag list.`);
      return tag;
    },
    device(id: string): DeviceOption {
      const device = devices.get(id);
      if (!device) throw new Error(`Unknown device id ${id}: use an id from the device list.`);
      return device;
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
  listDevices: ['ADMIN', 'USER'],
  listTags: ['ADMIN', 'USER'],
  listAssets: ['ADMIN', 'USER'],
  // The forms save through POST /users and POST/PATCH on /alarm-definitions, /devices and /tags, which are admin-only.
  createUser: ['ADMIN'],
  createAlarmRule: ['ADMIN'],
  editAlarmRule: ['ADMIN'],
  createDevice: ['ADMIN'],
  editDevice: ['ADMIN'],
  createTag: ['ADMIN'],
  editTag: ['ADMIN'],
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
  ) {}

  /**
   * The pickers' options, for the system prompt and for `create`. With
   * `forms`, also every device, tag and alarm rule, which only the form
   * tools use.
   */
  async filterOptions({ forms }: { forms: boolean }): Promise<FilterOptions> {
    const [assets, people, formOptions] = await Promise.all([
      this.assets.tree(),
      this.users.options(),
      forms ? this.formOptions() : undefined,
    ]);
    return { assets, people, ...(formOptions && { forms: formOptions }) };
  }

  private async formOptions(): Promise<NonNullable<FilterOptions['forms']>> {
    const [devices, tags, rules] = await Promise.all([
      this.devices.options(),
      this.tags.options(),
      this.alarmRules.options(),
    ]);
    return { devices, tags, rules };
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
