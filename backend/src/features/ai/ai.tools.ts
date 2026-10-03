import { ForbiddenException, Injectable } from '@nestjs/common';
import { tool, type InferUITools } from 'ai';
import {
  genUiToolSchemas,
  ListAlarmDefinitionsQuerySchema,
  ListAlarmsQuerySchema,
  ListAssetsQuerySchema,
  ListAuditLogsQuerySchema,
  ListDevicesQuerySchema,
  ListLogbookQuerySchema,
  ListTagsQuerySchema,
  ListUsersQuerySchema,
  type AssetTreeNode,
  type GenUIToolName,
  type GenUITools,
  type Role,
  type UserRef,
} from '@gen-ui/shared';
import { AlarmDefinitionsService } from '../alarms/alarm-definitions.service.js';
import { AlarmsService } from '../alarms/alarms.service.js';
import { AssetsService } from '../assets/assets.service.js';
import { DevicesService } from '../assets/devices.service.js';
import { TagsService } from '../assets/tags.service.js';
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
}

/**
 * Claude copies ids from the lists in its prompt. A miscopied id would
 * quietly filter everything out, so the tool refuses it; Claude reads the
 * error and tries again.
 */
function idChecks({ assets, people }: FilterOptions) {
  const assetIds = new Set(assets.map((asset) => asset.id));
  const peopleIds = new Set(people.map((person) => person.id));
  return {
    asset(id: string | undefined): void {
      if (id && !assetIds.has(id)) throw new Error(`Unknown asset id ${id}: use an id from the asset list.`);
    },
    people(ids: string[] | undefined): void {
      const unknown = ids?.find((id) => !peopleIds.has(id));
      if (unknown) throw new Error(`Unknown person id ${unknown}: use an id from the people list.`);
    },
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
} as const satisfies Record<GenUIToolName, readonly Role[]>;

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

  /** The pickers' options, for the system prompt and for `create`. */
  async filterOptions(): Promise<FilterOptions> {
    const [assets, people] = await Promise.all([this.assets.tree(), this.users.options()]);
    return { assets, people };
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
          // TOOL_ROLES already keeps this tool from everyone else; this is the second lock.
          if (user.role !== 'ADMIN') throw new ForbiddenException('The audit log is for admins only.');
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
    };
  }

  /** The tools this user may call. The model is never offered the others. */
  activeFor(user: AuthUser): GenUIToolName[] {
    return (Object.keys(TOOL_ROLES) as GenUIToolName[]).filter((name) =>
      (TOOL_ROLES[name] as readonly Role[]).includes(user.role),
    );
  }
}

export type AiToolSet = ReturnType<AiTools['create']>;

// Compile-time guard: the tools the backend executes must match the shared
// contract the frontend renders. A mismatch fails `tsc` here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const toolContractInSync: Same<InferUITools<AiToolSet>, GenUITools> = true;
void toolContractInSync;
