import { Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation, GenUIMessage } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const TITLE_LENGTH = 80;

/**
 * Saved assistant conversations: one row each, with the AI SDK's UI messages
 * (parts included) in a JSONB column. Every query is scoped to the caller, so
 * nobody can read or overwrite someone else's conversation.
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's most recently active conversation, if they have one. */
  async latest(userId: string): Promise<Conversation | null> {
    const row = await this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, messages: true },
    });
    return row && { id: row.id, messages: row.messages as unknown as GenUIMessage[] };
  }

  /**
   * A conversation's saved messages. Empty for an id not saved yet: a new
   * chat's row is created by its first message. Someone else's id is a 404.
   */
  async messages(id: string, userId: string): Promise<GenUIMessage[]> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
      select: { userId: true, messages: true },
    });
    if (!row) return [];
    if (row.userId !== userId) throw new NotFoundException('Conversation not found');
    return row.messages as unknown as GenUIMessage[];
  }

  async save(id: string, userId: string, messages: GenUIMessage[]): Promise<void> {
    const json = messages as unknown as Prisma.InputJsonValue;
    const { count } = await this.prisma.conversation.updateMany({
      where: { id, userId },
      data: { messages: json },
    });
    if (count === 0) {
      await this.prisma.conversation.create({ data: { id, userId, title: titleOf(messages), messages: json } });
    }
  }

  /** Deletes for good. An unknown id is not an error: there is simply nothing to clear. */
  async remove(id: string, userId: string): Promise<void> {
    await this.prisma.conversation.deleteMany({ where: { id, userId } });
  }
}

/** The first question, for a future list of conversations. */
function titleOf(messages: GenUIMessage[]): string {
  const first = messages.find((message) => message.role === 'user');
  const text = (first?.parts ?? [])
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1)}…` : text;
}
