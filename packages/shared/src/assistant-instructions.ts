import { z } from 'zod';
import { UserRefSchema } from './common/query.js';

/*
 * The assistant's standing instructions: the head of its system prompt, which
 * admins edit on the Settings page. The server appends the answer format, the
 * forms, the pick lists and the session after it on every request.
 */

/** The built-in text is about 5,500 characters. */
export const MAX_ASSISTANT_INSTRUCTIONS_LENGTH = 20_000;

export const AssistantInstructionsSchema = z
  .object({
    content: z.string().describe('The instructions in use.'),
    defaultContent: z.string().describe('The text built into the app, for "Restore default".'),
    isDefault: z.boolean().describe('`true` until an admin first saves: the built-in text is in use.'),
    updatedAt: z.iso.datetime().nullable(),
    updatedBy: UserRefSchema.nullable().describe('`null` before the first save, or once that user is deleted.'),
  })
  .meta({ id: 'AssistantInstructions' });
export type AssistantInstructions = z.infer<typeof AssistantInstructionsSchema>;

export const UpdateAssistantInstructionsSchema = z
  .strictObject({
    content: z
      .string()
      .trim()
      .min(1, 'Instructions are required')
      .max(MAX_ASSISTANT_INSTRUCTIONS_LENGTH, `Use at most ${MAX_ASSISTANT_INSTRUCTIONS_LENGTH.toLocaleString('en-US')} characters`),
  })
  .meta({ id: 'UpdateAssistantInstructions' });
export type UpdateAssistantInstructionsDto = z.output<typeof UpdateAssistantInstructionsSchema>;
