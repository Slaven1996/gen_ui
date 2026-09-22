import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ChatRequestSchema, type ChatRequest } from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AiService } from './ai.service.js';

@ApiTags('Assistant')
@ApiBearerAuth('access-token')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * Streams an AI SDK UI message stream (SSE) consumed by `useChat`.
   * Guards (JWT) still run with `@Res()`; only interceptors are bypassed.
   */
  @Post('chat')
  @ApiOperation({
    summary: 'Ask the assistant',
    description:
      'Streams an AI SDK UI message stream over SSE, so the reply arrives as `data:` frames rather than one JSON body — Swagger UI shows it as raw text. Parts of the answer are tool calls the web app renders as React components. Every call spends provider tokens.',
  })
  @ApiResponse({
    status: 201,
    description: 'The stream. Ends when the model stops, or as soon as the client disconnects.',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  @ApiErrorResponse(400, 'The envelope is malformed, or a message fails the tool contract.')
  @ApiErrorResponse(401, AUTH_REQUIRED)
  @ApiErrorResponse(503, 'No API key is configured for the selected `AI_PROVIDER`.')
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
}
