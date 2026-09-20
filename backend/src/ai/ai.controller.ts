import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatRequestSchema, type ChatRequest } from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AiService } from './ai.service.js';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * Streams an AI SDK UI message stream (SSE) consumed by `useChat`.
   * Guards (JWT) still run with `@Res()`; only interceptors are bypassed.
   */
  @Post('chat')
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
