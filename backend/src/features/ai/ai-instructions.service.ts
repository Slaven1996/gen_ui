import { Injectable } from '@nestjs/common';
import type { AssistantInstructions, UpdateAssistantInstructionsDto } from '@gen-ui/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { instructionsSelect, toAssistantInstructions } from './ai-instructions.mapper.js';
import { DEFAULT_INSTRUCTIONS } from './system-prompt.js';

/** The one row of `assistant_instructions`: saves update it in place, never add another. */
const INSTRUCTIONS_ID = '90000000-0000-4000-8000-000000000001';

/**
 * The assistant's standing instructions, the head of its system prompt, which
 * admins edit on the Settings page. Until the first save there is no row and
 * the text built into system-prompt.ts is used. Only the latest text is kept.
 */
@Injectable()
export class AiInstructionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  /** The text every chat request starts its system prompt with. */
  async current(): Promise<string> {
    const row = await this.prisma.assistantInstructions.findUnique({
      where: { id: INSTRUCTIONS_ID },
      select: { content: true },
    });
    return row?.content ?? DEFAULT_INSTRUCTIONS;
  }

  async get(): Promise<AssistantInstructions> {
    const row = await this.prisma.assistantInstructions.findUnique({
      where: { id: INSTRUCTIONS_ID },
      select: instructionsSelect,
    });
    return toAssistantInstructions(row);
  }

  /**
   * Saving the text already in use writes nothing and adds no audit record.
   * The audit record leaves the text out: it would show both versions in full.
   */
  async save({ content }: UpdateAssistantInstructionsDto, actor: AuthUser): Promise<AssistantInstructions> {
    return this.uow.run(async (tx) => {
      const current = await tx.assistantInstructions.findUnique({
        where: { id: INSTRUCTIONS_ID },
        select: instructionsSelect,
      });
      if ((current?.content ?? DEFAULT_INSTRUCTIONS) === content) return toAssistantInstructions(current);

      const row = await tx.assistantInstructions.upsert({
        where: { id: INSTRUCTIONS_ID },
        create: { id: INSTRUCTIONS_ID, content, updatedById: actor.id },
        update: { content, updatedById: actor.id },
        select: instructionsSelect,
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'assistant_instructions.update',
          entityType: 'ASSISTANT_INSTRUCTIONS',
          entityId: INSTRUCTIONS_ID,
          summary:
            content === DEFAULT_INSTRUCTIONS
              ? 'Restored the assistant’s default instructions'
              : 'Changed the assistant’s instructions',
        },
        tx,
      );
      return toAssistantInstructions(row);
    });
  }
}
