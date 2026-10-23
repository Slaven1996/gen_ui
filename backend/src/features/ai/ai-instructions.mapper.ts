import type { AssistantInstructions } from '@gen-ui/shared';
import { iso } from '../../common/list-query.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DEFAULT_INSTRUCTIONS } from './system-prompt.js';

export const instructionsSelect = {
  content: true,
  updatedAt: true,
  updatedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.AssistantInstructionsSelect;

export type InstructionsRecord = Prisma.AssistantInstructionsGetPayload<{ select: typeof instructionsSelect }>;

/** `null` before an admin first saves: the text built into the app is in use. */
export const toAssistantInstructions = (row: InstructionsRecord | null): AssistantInstructions => ({
  content: row?.content ?? DEFAULT_INSTRUCTIONS,
  defaultContent: DEFAULT_INSTRUCTIONS,
  isDefault: row === null,
  updatedAt: row ? iso(row.updatedAt) : null,
  updatedBy: row?.updatedBy ?? null,
});
