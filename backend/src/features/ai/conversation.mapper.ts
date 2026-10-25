import type { ConversationSummary } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { iso } from '../../common/list-query.js';

/** A chat in the list: never its messages, which can be large. */
export const conversationSummarySelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ConversationSelect;

export type ConversationSummaryRecord = Prisma.ConversationGetPayload<{ select: typeof conversationSummarySelect }>;

export function toConversationSummary(row: ConversationSummaryRecord): ConversationSummary {
  return { id: row.id, title: row.title, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
