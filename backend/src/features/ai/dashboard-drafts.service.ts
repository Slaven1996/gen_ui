import { Injectable, NotFoundException } from '@nestjs/common';
import { isDashboardDraftPart, type DashboardDraftResponse, type GenUIMessage } from '@gen-ui/shared';
import { DashboardsService } from '../dashboards/dashboards.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { ConversationsService } from './conversations.service.js';

const UNAVAILABLE = 'This draft is no longer available: the chat it came from was cleared.';

/**
 * The assistant's dashboard drafts. A `createDashboard` call only puts a
 * dashboard together; the user saves it on the Dashboard page, which reads
 * the call back from the saved conversation. Whether a dashboard was saved
 * from a draft is kept on the dashboard (its source), not in the
 * conversation: deleting the dashboard makes the draft "not created" again,
 * and a rename shows at once.
 */
@Injectable()
export class DashboardDraftsService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly dashboards: DashboardsService,
  ) {}

  /** One draft of the user's own conversation, and the dashboard saved from it, if any. */
  async get(conversationId: string, toolCallId: string, user: AuthUser): Promise<DashboardDraftResponse> {
    // Someone else's conversation is a 404 too; an unknown one has no messages.
    const messages = await this.conversations.messages(conversationId, user.id).catch((error: unknown) => {
      if (error instanceof NotFoundException) throw new NotFoundException(UNAVAILABLE);
      throw error;
    });
    const part = messages
      .flatMap((message) => message.parts)
      .find((each) => isDashboardDraftPart(each) && each.toolCallId === toolCallId);
    // Only a call that went through: one that failed (an unknown id) never was a draft.
    if (!part || !isDashboardDraftPart(part) || part.state !== 'output-available') throw new NotFoundException(UNAVAILABLE);

    const created = (await this.dashboards.createdFrom(conversationId)).find((each) => each.toolCallId === toolCallId);
    return { draft: part.input, dashboard: created ? { id: created.id, name: created.name } : null };
  }

  /**
   * The conversation as Claude reads it: each draft's output says whether a
   * dashboard was saved from it, and under which name now. Only this copy
   * changes; the saved conversation never holds it.
   */
  async withStatus(messages: GenUIMessage[], conversationId: string): Promise<GenUIMessage[]> {
    if (!messages.some((message) => message.parts.some(isDashboardDraftPart))) return messages;
    const created = new Map((await this.dashboards.createdFrom(conversationId)).map((each) => [each.toolCallId, each.name]));
    return messages.map((message) => {
      if (!message.parts.some(isDashboardDraftPart)) return message;
      const parts = message.parts.map((part) => {
        if (!isDashboardDraftPart(part) || part.state !== 'output-available') return part;
        const name = created.get(part.toolCallId);
        const output = { ...part.output, created: name === undefined ? null : { name } };
        return { ...part, output } as GenUIMessage['parts'][number];
      });
      return { ...message, parts };
    });
  }
}
