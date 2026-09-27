import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  createIdGenerator,
  isStepCount,
  pipeUIMessageStreamToResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type LanguageModel,
} from 'ai';
import type { ServerResponse } from 'node:http';
import { MAX_CONVERSATION_MESSAGES, type ChatRequest, type GenUIMessage } from '@gen-ui/shared';
import { AppConfigService } from '../../config/app-config.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AiTools, type AiToolSet } from './ai.tools.js';
import { ConversationsService } from './conversations.service.js';
import { buildInstructions } from './system-prompt.js';

export interface StreamChatParams {
  user: AuthUser;
  request: ChatRequest;
  response: ServerResponse;
  abortSignal: AbortSignal;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  /** `null` without an API key: the chat answers 503 and the rest of the app runs. */
  private readonly model: LanguageModel | null;
  private readonly generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

  constructor(
    private readonly tools: AiTools,
    private readonly conversations: ConversationsService,
    private readonly config: AppConfigService,
  ) {
    const apiKey = config.get('ANTHROPIC_API_KEY');
    this.model = apiKey ? createAnthropic({ apiKey })(config.get('AI_MODEL')) : null;
    if (!apiKey) this.logger.warn('ANTHROPIC_API_KEY is not set — POST /api/ai/chat will return 503.');
  }

  /**
   * Continues the saved conversation with this request, runs the model with
   * the tools the user may call, and pipes an AI SDK UI message stream (SSE)
   * to the response. The conversation is saved before the model runs (so the
   * question survives a failed call) and again when the stream ends. Throws
   * HTTP exceptions only before the first byte is written.
   */
  async streamChat({ user, request, response, abortSignal }: StreamChatParams): Promise<void> {
    if (!this.model) {
      throw new ServiceUnavailableException('AI is not configured. Set ANTHROPIC_API_KEY in .env.');
    }

    const tools = this.tools.create();
    const stored = await this.conversations.messages(request.id, user.id);
    console.log('stored');
    console.log(stored);
    const messages = await validate(nextHistory(stored, request), tools);
    console.log('MESSAGES2');
    console.log(messages);
    await this.conversations.save(request.id, user.id, messages);

    const result = streamText({
      model: this.model,
      instructions: buildInstructions({ user, context: request.context, generateUi: request.generateUi }),
      messages: await convertToModelMessages(messages, { tools }),
      tools,
      activeTools: this.tools.activeFor(user),
      stopWhen: isStepCount(this.config.get('AI_MAX_STEPS')),
      maxOutputTokens: this.config.get('AI_MAX_OUTPUT_TOKENS'),
      providerOptions: { anthropic: anthropicOptions(this.config) },
      abortSignal,
    });

    const stream = toUIMessageStream<AiToolSet, GenUIMessage>({
      stream: result.stream,
      tools,
      originalMessages: messages,
      generateMessageId: this.generateMessageId,
      sendReasoning: this.config.get('AI_SEND_REASONING'),
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return { model: this.config.get('AI_MODEL'), createdAt: Date.now(), generateUi: request.generateUi };
        }
        if (part.type === 'finish') return { finishReason: part.finishReason };
        return undefined;
      },
      // Also runs when the user presses Stop, so a partial answer is kept.
      onEnd: async ({ messages: updated }) => {
        try {
          await this.conversations.save(request.id, user.id, withoutEmptyAnswer(updated));
        } catch (error) {
          this.logger.error('Saving the conversation failed', error instanceof Error ? error.stack : String(error));
        }
      },
      onError: (error) => {
        this.logger.error('Chat stream failed', error instanceof Error ? error.stack : String(error));
        return 'The assistant ran into a problem. Please try again.';
      },
    });

    await pipeUIMessageStreamToResponse({ response, stream });
  }
}

/**
 * The conversation this request continues: the saved messages plus the new
 * question (`submit-message`; a retried send replaces its earlier copy), or
 * minus the last answer (`regenerate-message`, the "Try again" button).
 */
function nextHistory(stored: GenUIMessage[], request: ChatRequest): unknown[] {
  if (request.trigger === 'regenerate-message') {
    return stored.at(-1)?.role === 'assistant' ? stored.slice(0, -1) : stored;
  }
  if (request.message === undefined) {
    throw new BadRequestException('`message` is required to send a message');
  }
  const last = stored.at(-1);
  const sameId = last !== undefined && last.id === (request.message as { id?: unknown } | null)?.id;
  return sameId ? [...stored.slice(0, -1), request.message] : [...stored, request.message];
}

/** Deep-checks the whole conversation against the tool schemas and the house rules. */
async function validate(messages: unknown[], tools: AiToolSet): Promise<GenUIMessage[]> {
  if (messages.length > MAX_CONVERSATION_MESSAGES) {
    throw new BadRequestException('This conversation is full. Clear the chat to start a new one.');
  }
  const validated = await safeValidateUIMessages<GenUIMessage>({ messages, tools });
  if (!validated.success) {
    throw new BadRequestException(
      `This conversation can't be continued (${validated.error.message}). Clear the chat to start a new one.`,
    );
  }
  const result = validated.data;
  if (result.some((message) => message.role === 'system')) {
    throw new BadRequestException('System messages are set by the server');
  }
  // Claude Opus 5 does not accept assistant-prefill, so the turn must end with the user.
  if (result.at(-1)?.role !== 'user') {
    throw new BadRequestException('The last message must come from the user');
  }
  return result;
}

/** A call that failed before producing anything leaves an empty answer; don't save it. */
function withoutEmptyAnswer(messages: GenUIMessage[]): GenUIMessage[] {
  const last = messages.at(-1);
  const empty = last?.role === 'assistant' && !last.parts.some((part) => part.type !== 'step-start');
  return empty ? messages.slice(0, -1) : messages;
}

/**
 * Claude Opus 5 / Sonnet 5 think adaptively. Do NOT add `budgetTokens`,
 * `temperature` or `topP`: these models reject them with a 400.
 */
function anthropicOptions(config: AppConfigService) {
  const effort = config.get('AI_EFFORT');
  console.log('EFFORT: ');
  console.log(effort);
  return {
    thinking: {
      type: 'adaptive',
      // The default ("omitted") streams empty reasoning; summaries give the UI something to show.
      display: config.get('AI_SEND_REASONING') ? 'summarized' : 'omitted',
    },
    ...(effort && { effort }),
    // Server-side refusal fallback — the provider adds the required beta header itself.
    ...(config.get('AI_REFUSAL_FALLBACK') && { fallbacks: 'default' as const }),
  } satisfies AnthropicLanguageModelOptions;
}
