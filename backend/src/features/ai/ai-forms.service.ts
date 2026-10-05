import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getStaticToolName } from 'ai';
import {
  isFormToolPart,
  type FormOutcome,
  type FormOutcomeRequest,
  type FormToolName,
  type FormToolOutput,
  type FormToolUIPart,
  type GenUIMessage,
  type GenUITools,
} from '@gen-ui/shared';
import { AlarmDefinitionsService } from '../alarms/alarm-definitions.service.js';
import { diff } from '../audit/audit.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { UsersService } from '../users/users.service.js';
import { mayUse, toRuleSnapshot } from './ai.tools.js';
import { ConversationsService } from './conversations.service.js';

type Output<N extends FormToolName> = GenUITools[N]['output'];
type Saved<N extends FormToolName> = Extract<NonNullable<Output<N>['outcome']>, { status: 'saved' }>;

/** For each form tool: the outcome of a save, read from the record it saved. */
type SavedOutcomes = {
  [N in FormToolName]: (call: { input: GenUITools[N]['input']; output: Output<N>; entityId: string }) => Promise<Saved<N>>;
};

/**
 * What became of the forms the assistant opened. A form tool's call ends
 * when the form opens (`{ status: 'opened' }`); the user saves later through
 * the page's own REST endpoint, which the chat never sees. The browser then
 * reports it here, and the outcome is written into that call's output in the
 * saved conversation. So a reloaded chat shows the result instead of the
 * form, and Claude reads it on its next turn. No model call is involved.
 */
@Injectable()
export class AiFormsService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly users: UsersService,
    private readonly alarmRules: AlarmDefinitionsService,
  ) {}

  /**
   * The browser sends only the saved record's id; the facts Claude will read
   * (names, what changed) come from the database, not from the browser.
   * TypeScript requires an entry for every form tool.
   */
  private readonly saved: SavedOutcomes = {
    createUser: async ({ entityId }) => {
      const { name, email, role } = await this.users.get(entityId);
      return { status: 'saved', user: { name, email, role } };
    },
    createAlarmRule: async ({ entityId }) => {
      const rule = await this.alarmRules.get(entityId);
      return { status: 'saved', rule: { name: rule.name, tag: rule.tag.name, asset: rule.asset.name } };
    },
    editAlarmRule: async ({ input, output, entityId }) => {
      if (entityId !== input.ruleId) throw new BadRequestException('That is not the rule this form edits.');
      const rule = await this.alarmRules.get(entityId);
      return { status: 'saved', changed: diff(output.rule, toRuleSnapshot(rule)) };
    },
  };

  /**
   * Records that the user saved or closed the form opened by `toolCallId` in
   * conversation `id`, once. Returns the tool's output with its outcome.
   */
  async recordOutcome(
    id: string,
    toolCallId: string,
    request: FormOutcomeRequest,
    user: AuthUser,
  ): Promise<FormToolOutput> {
    return this.conversations.update(id, user.id, async (messages) => {
      const part = findFormPart(messages, toolCallId);
      const name = getStaticToolName<Pick<GenUITools, FormToolName>>(part);
      if (!mayUse(user, name)) throw new ForbiddenException('Signed in, but not allowed to use this form.');
      if (part.state !== 'output-available') throw new ConflictException('This form never opened.');
      if (part.output.outcome) throw new ConflictException('This form is already saved or closed.');

      const savedOutcome = this.saved[name] as unknown as (call: {
        input: unknown;
        output: unknown;
        entityId: string;
      }) => Promise<FormOutcome>;
      const outcome: FormOutcome =
        request.status === 'closed'
          ? { status: 'closed' }
          : await savedOutcome({ input: part.input, output: part.output, entityId: request.entityId });
      const output = { ...part.output, outcome } as FormToolOutput;

      const next = messages.map((message) => ({
        ...message,
        parts: message.parts.map((each) =>
          each === part ? ({ ...part, output } as GenUIMessage['parts'][number]) : each,
        ),
      }));
      return { messages: next, result: output };
    });
  }
}

function findFormPart(messages: GenUIMessage[], toolCallId: string): FormToolUIPart {
  for (const message of messages) {
    for (const part of message.parts) {
      if (isFormToolPart(part) && part.toolCallId === toolCallId) return part;
    }
  }
  throw new NotFoundException('No such form in this conversation.');
}
