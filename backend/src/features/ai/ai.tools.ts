import { ForbiddenException, Injectable } from '@nestjs/common';
import { tool, type InferUITools } from 'ai';
import {
  genUiToolSchemas,
  ListAlarmDefinitionsQuerySchema,
  ListAuditLogsQuerySchema,
  ListUsersQuerySchema,
  type GenUIToolName,
  type GenUITools,
  type Role,
} from '@gen-ui/shared';
import { AlarmDefinitionsService } from '../alarms/alarm-definitions.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { UsersService } from '../users/users.service.js';

/** Rows handed to the model per list; the table in the chat pages through the rest itself. */
const ROWS_FOR_MODEL = 20;

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
  ) {}

  /**
   * A fresh tool set per request; `execute` is what the AI SDK runs for each
   * call. `user` is who is asking. `timeZone` is theirs, so a date Claude
   * takes from their words ("signed in yesterday") means the same day the
   * web app's table shows.
   */
  create({ user, timeZone }: { user: AuthUser; timeZone: string }) {
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
