import { Injectable, NotFoundException } from '@nestjs/common';
import {
  isFormToolPart,
  type Conversation,
  type ConversationList,
  type ConversationSummary,
  type FormOutcome,
  type GenUIMessage,
  type ListConversationsQuery,
} from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { pageArgs, toPaginated } from '../../common/list-query.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../../prisma/transaction.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import { provisionalTitle } from './conversation-title.js';
import { conversationSummarySelect, toConversationSummary } from './conversation.mapper.js';

/**
 * Saved assistant conversations (the chats): one row each, with the AI SDK's
 * UI messages (parts included) in a JSONB column. A user has any number of
 * them. Every query is scoped to the caller, so nobody can read or overwrite
 * someone else's conversation.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  /** The user's chats, latest activity first, without their messages. */
  async list(userId: string, query: ListConversationsQuery): Promise<ConversationList> {
    const where = { userId } satisfies Prisma.ConversationWhereInput;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        select: conversationSummarySelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return toPaginated(rows.map(toConversationSummary), total, query);
  }

  /** One of the user's chats with every message. Unknown or someone else's is a 404. */
  async get(id: string, userId: string): Promise<Conversation> {
    const row = await this.prisma.conversation.findFirst({
      where: { id, userId },
      select: { id: true, title: true, messages: true },
    });
    if (!row) throw new NotFoundException('Conversation not found');
    return { id: row.id, title: row.title, messages: row.messages as unknown as GenUIMessage[] };
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

  /**
   * Saves the conversation as a turn starts, creating it on its first
   * message (titled with that question). A form's outcome recorded since
   * `messages` was read is kept.
   */
  async start(id: string, userId: string, messages: GenUIMessage[]): Promise<void> {
    await this.uow.run(async (tx) => {
      const stored = await lockedMessages(tx, id, userId);
      if (stored === null) {
        await tx.conversation.create({ data: { id, userId, title: provisionalTitle(messages), messages: toJson(messages) } });
        return;
      }
      await tx.conversation.update({ where: { id }, data: { messages: toJson(keepOutcomes(stored, messages)) } });
    });
  }

  /**
   * Saves the conversation as a turn ends. A form's outcome recorded since
   * `messages` was read is kept: the chat saves its copy when an answer ends,
   * and that copy may predate the user saving or closing a form in the
   * meantime. Never creates the row: a chat deleted while it was answering
   * stays deleted.
   */
  async finish(id: string, userId: string, messages: GenUIMessage[]): Promise<void> {
    await this.uow.run(async (tx) => {
      const stored = await lockedMessages(tx, id, userId);
      if (stored === null) return;
      await tx.conversation.update({ where: { id }, data: { messages: toJson(keepOutcomes(stored, messages)) } });
    });
  }

  /**
   * Changes one conversation's saved messages in place, with its row locked
   * so a save from the chat can't interleave. `change` returns the new
   * messages and what to hand back to the caller. Someone else's or an
   * unknown conversation is a 404.
   */
  async update<T>(
    id: string,
    userId: string,
    change: (messages: GenUIMessage[]) => Promise<{ messages: GenUIMessage[]; result: T }>,
  ): Promise<T> {
    return this.uow.run(async (tx) => {
      const stored = await lockedMessages(tx, id, userId);
      if (stored === null) throw new NotFoundException('Conversation not found');
      const { messages, result } = await change(stored);
      await tx.conversation.update({ where: { id }, data: { messages: toJson(messages) } });
      return result;
    });
  }

  /**
   * Renames one of the user's chats. Its `updatedAt` stays, so renaming
   * doesn't move it to the top of the list. Unknown or someone else's is a 404.
   */
  async rename(id: string, userId: string, title: string): Promise<ConversationSummary> {
    const row = await this.prisma.conversation.findFirst({ where: { id, userId }, select: { updatedAt: true } });
    if (!row) throw new NotFoundException('Conversation not found');
    const renamed = await this.prisma.conversation.update({
      where: { id },
      data: { title, updatedAt: row.updatedAt },
      select: conversationSummarySelect,
    });
    return toConversationSummary(renamed);
  }

  /**
   * Replaces the title the chat was saved with (`from`) by Claude's. A chat
   * the user renamed in the meantime, or deleted, is left alone.
   */
  async retitle(id: string, userId: string, from: string, to: string): Promise<void> {
    await this.prisma.conversation.updateMany({ where: { id, userId, title: from }, data: { title: to } });
  }

  /** Deletes for good. An unknown id is not an error: there is simply nothing to delete. */
  async remove(id: string, userId: string): Promise<void> {
    await this.prisma.conversation.deleteMany({ where: { id, userId } });
  }
}

type Part = GenUIMessage['parts'][number];

const toJson = (messages: GenUIMessage[]) => messages as unknown as Prisma.InputJsonValue;

/**
 * The saved messages, with the row locked until the transaction ends; `null`
 * when the conversation isn't saved yet. Someone else's is a 404.
 */
async function lockedMessages(tx: Db, id: string, userId: string): Promise<GenUIMessage[] | null> {
  const [locked] = await tx.$queryRaw<{ user_id: string }[]>`
    SELECT "user_id" FROM "conversations" WHERE "id" = ${id}::uuid FOR UPDATE`;
  if (!locked) return null;
  if (locked.user_id !== userId) throw new NotFoundException('Conversation not found');
  const row = await tx.conversation.findUniqueOrThrow({ where: { id }, select: { messages: true } });
  return row.messages as unknown as GenUIMessage[];
}

/** `next`, with every form outcome already in `stored` carried over (an outcome is never undone). */
function keepOutcomes(stored: GenUIMessage[], next: GenUIMessage[]): GenUIMessage[] {
  const recorded = new Map<string, FormOutcome>();
  for (const part of stored.flatMap((message) => message.parts)) {
    if (isFormToolPart(part) && part.state === 'output-available' && part.output.outcome) {
      recorded.set(part.toolCallId, part.output.outcome);
    }
  }
  if (recorded.size === 0) return next;

  const withOutcome = (part: Part): Part => {
    if (!isFormToolPart(part) || part.state !== 'output-available' || part.output.outcome) return part;
    const outcome = recorded.get(part.toolCallId);
    return outcome ? ({ ...part, output: { ...part.output, outcome } } as Part) : part;
  };
  return next.map((message) => {
    const parts = message.parts.map(withOutcome);
    return parts.every((part, index) => part === message.parts[index]) ? message : { ...message, parts };
  });
}
