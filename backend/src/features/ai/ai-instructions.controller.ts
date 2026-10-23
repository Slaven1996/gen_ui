import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AssistantInstructionsSchema,
  UpdateAssistantInstructionsSchema,
  type AssistantInstructions,
  type UpdateAssistantInstructionsDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AiInstructionsService } from './ai-instructions.service.js';

@ApiTags('Assistant')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@ApiErrorResponse(403, ADMIN_ONLY)
@Controller('ai/instructions')
@Roles(['ADMIN'])
export class AiInstructionsController {
  constructor(private readonly instructions: AiInstructionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the assistant’s instructions',
    description:
      'The standing instructions every chat starts its system prompt with (the Settings page). The server appends the answer format, the forms, the pick lists and the session after them. `isDefault` is true until an admin first saves; `defaultContent` is the text built into the app.',
  })
  @ApiOkResponse({ standardSchema: AssistantInstructionsSchema })
  get(): Promise<AssistantInstructions> {
    return this.instructions.get();
  }

  @Put()
  @ApiOperation({
    summary: 'Change the assistant’s instructions',
    description:
      'Replaces the instructions; the next chat request uses them. Only the latest text is kept. Saving the text already in use changes nothing; anything else is recorded in the audit log (without the text). To go back to the built-in text, send `defaultContent`.',
  })
  @ApiOkResponse({ standardSchema: AssistantInstructionsSchema })
  @ApiErrorResponse(400, '`content` is empty, or longer than 20,000 characters.')
  save(
    @Body({ schema: UpdateAssistantInstructionsSchema }) dto: UpdateAssistantInstructionsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AssistantInstructions> {
    return this.instructions.save(dto, actor);
  }
}
