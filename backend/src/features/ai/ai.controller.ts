import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ChatRequestSchema,
  FormOutcomeRequestSchema,
  FormToolOutputSchema,
  LatestConversationSchema,
  type ChatRequest,
  type FormOutcomeRequest,
  type FormToolOutput,
  type LatestConversation,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AiFormsService } from './ai-forms.service.js';
import { AiService } from './ai.service.js';
import { ConversationsService } from './conversations.service.js';

@ApiTags('Assistant')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly conversations: ConversationsService,
    private readonly forms: AiFormsService,
  ) {}

  /**
   * Streams an AI SDK UI message stream (SSE) consumed by `useChat`.
   * Guards (JWT) still run with `@Res()`; only interceptors are bypassed.
   */
  @Post('chat')
  @ApiOperation({
    summary: 'Ask the assistant',
    description:
      'Continues your saved conversation `id` (a new id starts one): send only the new `message`, or `trigger: "regenerate-message"` to answer the last question again. `model` picks the Claude model (default Claude Haiku 4.5) and `effort` its effort level (ignored by Haiku). `timeZone` is where "today" and the dates you mention are read. Streams an AI SDK UI message stream over SSE, so the reply arrives as `data:` frames rather than one JSON body — Swagger UI shows it as raw text. Parts of the answer are tool calls the web app renders as React components unless `generateUi` is false. Every call spends provider tokens.',
  })
  @ApiResponse({
    status: 201,
    description: 'The stream. Ends when the model stops, or as soon as the client disconnects.',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  @ApiErrorResponse(
    400,
    'The envelope is malformed (for example an unknown `model`), a message fails the tool contract, or the conversation is full.',
  )
  @ApiErrorResponse(404, 'The conversation belongs to someone else.')
  @ApiErrorResponse(503, 'ANTHROPIC_API_KEY is not configured.')
  async chat(
    @Body({ schema: ChatRequestSchema }) body: ChatRequest,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    // Stop generating (and paying for) tokens when the client disconnects or presses Stop.
    // Listen on the response: the request's 'close' fires as soon as the body is read.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    await this.ai.streamChat({ user, request: body, response: res, abortSignal: abort.signal });
  }

  @Get('conversations/latest')
  @ApiOperation({
    summary: 'Your saved conversation',
    description:
      'Your most recent conversation with every message, parts included, so the web app can render it again. `conversation` is null when there is none.',
  })
  @ApiOkResponse({ standardSchema: LatestConversationSchema })
  async latest(@CurrentUser() user: AuthUser): Promise<LatestConversation> {
    return { conversation: await this.conversations.latest(user.id) };
  }

  @Put('conversations/:id/forms/:toolCallId')
  @ApiOperation({
    summary: 'Record what happened to a form',
    description:
      'When the assistant opens a form in an answer (add a user; create or edit an alarm rule, a device, a tag, an asset or a logbook entry), the tool call ends there and the user saves through the same endpoint the page uses, as from the modal. The web app then calls this with `saved` and the id of the saved record, or with `closed` when the form was closed unsaved. The server reads the record and adds the outcome to the output of that tool call in the saved conversation, so a reload shows the result instead of the form and Claude knows on its next turn. Once per form. No model call.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'The conversation.' })
  @ApiParam({ name: 'toolCallId', description: "The form tool call's id, from its part in the conversation." })
  @ApiOkResponse({ standardSchema: FormToolOutputSchema, description: "The tool call's output, now with `outcome`." })
  @ApiErrorResponse(400, '`id` is not a UUID, the body is malformed, or `entityId` is not the record this form edits.')
  @ApiErrorResponse(403, 'Your role may not use this form.')
  @ApiErrorResponse(404, 'No such conversation of yours, no form with that id in it, or no record with `entityId`.')
  @ApiErrorResponse(409, 'The form is already saved or closed.')
  recordFormOutcome(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('toolCallId') toolCallId: string,
    @Body({ schema: FormOutcomeRequestSchema }) body: FormOutcomeRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<FormToolOutput> {
    return this.forms.recordOutcome(id, toolCallId, body, user);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Clear a conversation',
    description: 'Deletes one of your conversations for good. An unknown id is not an error.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted, or there was nothing to delete.' })
  @ApiErrorResponse(400, '`id` is not a UUID.')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.conversations.remove(id, user.id);
  }
}
