import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  convertToModelMessages,
  isStepCount,
  pipeUIMessageStreamToResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from 'ai';
import type { ServerResponse } from 'node:http';
import type { ChatRequest, GenUIMessage } from '@gen-ui/shared';
import { AppConfigService } from '../config/app-config.service.js';
import { AI_KEY_VARS } from '../config/env.schema.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AI_LANGUAGE_MODEL, type AiLanguageModel } from './ai-provider.factory.js';
import { buildProviderOptions } from './provider-options.js';
import { buildInstructions } from './system-prompt.js';
import { GenUiToolsFactory, type GenUiToolSet } from './tools/gen-ui-tools.factory.js';

export interface StreamChatParams {
  user: AuthUser;
  request: ChatRequest;
  response: ServerResponse;
  abortSignal: AbortSignal;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_LANGUAGE_MODEL) private readonly model: AiLanguageModel,
    private readonly tools: GenUiToolsFactory,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Validates the conversation, runs the model with the Generative UI tools and
   * pipes an AI SDK UI message stream (SSE) to the response. Throws HTTP
   * exceptions only before the first byte is written.
   */
  async streamChat({ user, request, response, abortSignal }: StreamChatParams): Promise<void> {
    if (!this.model) {
      const keyVar = AI_KEY_VARS[this.config.get('AI_PROVIDER')];
      throw new ServiceUnavailableException(`AI is not configured. Set ${keyVar} in backend/.env.`);
    }

    const tools = this.tools.create(user);
    const validated = await safeValidateUIMessages<GenUIMessage>({ messages: request.messages, tools });
    if (!validated.success) {
      throw new BadRequestException(`Invalid chat messages: ${validated.error.message}`);
    }

    const messages = validated.data;
    if (messages.some((message) => message.role === 'system')) {
      throw new BadRequestException('System messages are set by the server');
    }
    // Claude Opus 5 does not accept assistant-prefill, so the turn must end with the user.
    if (messages.at(-1)?.role !== 'user') {
      throw new BadRequestException('The last message must come from the user');
    }

    const result = streamText({
      model: this.model,
      instructions: buildInstructions(user, request.context),
      messages: await convertToModelMessages(messages, { tools }),
      tools,
      activeTools: this.tools.activeToolsFor(user),
      stopWhen: isStepCount(this.config.get('AI_MAX_STEPS')),
      maxOutputTokens: this.config.get('AI_MAX_OUTPUT_TOKENS'),
      providerOptions: buildProviderOptions(this.config),
      abortSignal,
    });

    const stream = toUIMessageStream<GenUiToolSet, GenUIMessage>({
      stream: result.stream,
      tools,
      originalMessages: messages,
      sendReasoning: this.config.get('AI_SEND_REASONING'),
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return { model: this.config.get('AI_MODEL'), createdAt: Date.now() };
        }
        if (part.type === 'finish') return { finishReason: part.finishReason };
        return undefined;
      },
      onError: (error) => {
        this.logger.error('Chat stream failed', error instanceof Error ? error.stack : String(error));
        return 'The assistant ran into a problem. Please try again.';
      },
    });

    await pipeUIMessageStreamToResponse({ response, stream });
  }
}
