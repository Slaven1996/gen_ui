import { Injectable } from '@nestjs/common';
import { tool, type InferUITools } from 'ai';
import {
  genUiToolSchemas,
  ListUsersQuerySchema,
  type GenUIToolName,
  type GenUITools,
  type Role,
} from '@gen-ui/shared';
import type { AuthUser } from '../users/user.mapper.js';
import { UsersService } from '../users/users.service.js';

/** Rows handed to the model per list; the table in the chat pages through the rest itself. */
const ROWS_FOR_MODEL = 20;

/**
 * Who may use each tool: the chat's `@Roles`. HTTP guards don't run for tool
 * calls, so this map is the tools' authorization. `satisfies` makes every
 * tool declare its roles. A tool limited to admins also checks the role
 * inside `execute`, in case this map and the check ever drift apart.
 */
const TOOL_ROLES = {
  listUsers: ['ADMIN', 'USER'],
} as const satisfies Record<GenUIToolName, readonly Role[]>;

/**
 * The assistant's tools. Like controllers, they are adapters: each one turns
 * a tool call into a call on a domain service, so the chat gets the same
 * rules and mapping as the REST API. Tools never call a controller or a
 * repository. A new domain adds its tool here, with its contract in
 * @gen-ui/shared, and injects that domain's service.
 */
@Injectable()
export class AiTools {
  constructor(private readonly users: UsersService) {}

  create() {
    return {
      listUsers: tool({
        ...genUiToolSchemas.listUsers,
        // `title` only labels the table; the rest is the `/users` query.
        execute: async ({ title: _title, ...filters }) => {
          console.log('FILTERI');
          console.log(filters);
          const page = await this.users.list(ListUsersQuerySchema.parse({ ...filters, pageSize: ROWS_FOR_MODEL }));
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
