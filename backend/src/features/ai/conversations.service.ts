import { Injectable, NotFoundException } from '@nestjs/common';
import { isFormToolPart, type Conversation, type FormOutcome, type GenUIMessage } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../../prisma/transaction.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';

const TITLE_LENGTH = 80;

/**
 * Saved assistant conversations: one row each, with the AI SDK's UI messages
 * (parts included) in a JSONB column. Every query is scoped to the caller, so
 * nobody can read or overwrite someone else's conversation.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

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

  /**
   * Saves the whole conversation. A form's outcome recorded since `messages`
   * was read is kept: the chat saves its copy when an answer ends, and that
   * copy may predate the user saving or closing a form in the meantime.
   */
  async save(id: string, userId: string, messages: GenUIMessage[]): Promise<void> {
    await this.uow.run(async (tx) => {
      const stored = await lockedMessages(tx, id, userId);
      if (stored === null) {
        await tx.conversation.create({ data: { id, userId, title: titleOf(messages), messages: toJson(messages) } });
        return;
      }
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

  /** Deletes for good. An unknown id is not an error: there is simply nothing to clear. */
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
