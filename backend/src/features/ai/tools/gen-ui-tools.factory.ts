import { Injectable } from '@nestjs/common';
import type { InferUITools } from 'ai';
import type { GenUITools } from '@gen-ui/shared';
import type { AuthUser } from '../../users/user.mapper.js';
import { UsersRepository } from '../../users/users.repository.js';
import { showChartTool, showStatCardsTool } from './display.tools.js';
import { listUsersTool } from './list-users.tool.js';

@Injectable()
export class GenUiToolsFactory {
  constructor(private readonly users: UsersRepository) {}

  /** Tools are built per request so data tools can close over the caller. */
  create(actor: AuthUser) {
    return {
      showStatCards: showStatCardsTool(),
      showChart: showChartTool(),
      listUsers: listUsersTool(this.users, actor),
    };
  }

  /** Which tools the model may call for this user (`undefined` = all). */
  activeToolsFor(actor: AuthUser): Array<keyof GenUiToolSet> | undefined {
    return actor.role === 'ADMIN' ? undefined : ['showStatCards', 'showChart'];
  }
}

export type GenUiToolSet = ReturnType<GenUiToolsFactory['create']>;

// Compile-time guard: the tools the backend executes must match the shared
// contract the frontend renders. A mismatch fails `tsc` here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const toolContractInSync: Same<InferUITools<GenUiToolSet>, GenUITools> = true;
void toolContractInSync;
