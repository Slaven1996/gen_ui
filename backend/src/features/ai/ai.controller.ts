import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
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
  LatestConversationSchema,
  type ChatRequest,
  type LatestConversation,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
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
  ) {}

  /**
   * Streams an AI SDK UI message stream (SSE) consumed by `useChat`.
   * Guards (JWT) still run with `@Res()`; only interceptors are bypassed.
   */
  @Post('chat')
  @ApiOperation({
    summary: 'Ask the assistant',
    description:
      'Continues your saved conversation `id` (a new id starts one): send only the new `message`, or `trigger: "regenerate-message"` to answer the last question again. `model` picks the Claude model (default Claude Haiku 4.5) and `effort` its effort level (ignored by Haiku). `context.timeZone` is where "today" and the dates you mention are read. Streams an AI SDK UI message stream over SSE, so the reply arrives as `data:` frames rather than one JSON body — Swagger UI shows it as raw text. Parts of the answer are tool calls the web app renders as React components unless `generateUi` is false. Every call spends provider tokens.',
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
