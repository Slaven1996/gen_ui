import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createAnthropic, type AnthropicLanguageModelOptions, type AnthropicProvider } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  createIdGenerator,
  isStepCount,
  pipeUIMessageStreamToResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from 'ai';
import type { ServerResponse } from 'node:http';
import {
  ASSISTANT_MODELS,
  DEFAULT_EFFORT,
  MAX_CONVERSATION_MESSAGES,
  type AssistantModel,
  type ChatRequest,
  type Effort,
  type GenUIMessage,
} from '@gen-ui/shared';
import { AppConfigService } from '../../config/app-config.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AiTools, type AiToolSet } from './ai.tools.js';
import { ConversationsService } from './conversations.service.js';
import { buildInstructions } from './system-prompt.js';

/*
 * ════════════════════════════════════════════════════════════════════════════
 *  The assistant, end to end: one POST /api/ai/chat
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  [app] our code: deterministic, same input → same result
 *  [AI]  decided by Claude while the request runs
 *
 *  1 [app] Load the saved conversation and add the new question.
 *  2 [app] Validate all of it against the tool contracts.
 *  3 [app] Save it, so the question survives a failed model call.
 *  4 [app] Call the chosen model with the system prompt (system-prompt.ts),
 *          the history, and the tools this user's role may use (ai.tools.ts).
 *          The prompt lists the assets, people and shift templates the
 *          pages' pickers offer, so Claude can fill those filters with
 *          their ids, and the plant's clock that shift dates are on. Lists a
 *          tool on offer takes by id are added: devices, tags, alarm rules
 *          and the user's own latest logbook entries.
 *  5 [AI]  Claude decides what to do: answer, politely refuse an off-topic
 *          request, or call tools, choosing which tools, their filters, and
 *          how many to run at once.
 *  6 [app] The AI SDK runs every tool call: AiTools → the domain's service
 *          (UsersService, AlarmsService, AlarmDefinitionsService,
 *          LogbookService, DevicesService, TagsService, AssetsService,
 *          TelemetryService, ShiftsService, AuditService) → database.
 *  7 [AI]  Claude reads the tool results and writes the answer. Steps 5–7
 *          repeat until it answers without calling a tool (at most
 *          AI_MAX_STEPS rounds).
 *  8 [app] Each part (text, reasoning, tool input and output) streams to the
 *          browser as it is produced, over Server-Sent Events.
 *  9 [app] When the stream ends (also after Stop), save the conversation.
 *
 *  Form tools (add a user; create or edit an alarm rule, a device, a tag, an
 *  asset, a logbook entry or a shift template; schedule, edit or copy shifts)
 *  only open the app's own form in the answer. The user saves it later
 *  through the page's REST endpoint, and the browser reports the outcome to
 *  PUT /ai/conversations/:id/forms/:toolCallId (ai-forms.service.ts).
 *
 *  In the browser a fixed registry turns each tool part into a React
 *  component (frontend/src/features/assistant/lib/tool-renderers.ts). Claude chooses
 *  the tool and its filters; it never writes UI code or data of its own.
 */

/**
 * Request limits per model. `refusalFallback`: Anthropic can re-run a request
 * Claude Opus 5 declined on another model (server side); the option is only
 * sent where it is documented.
 */
const MODEL_LIMITS: Record<AssistantModel, { maxOutputTokens: number; refusalFallback: boolean }> = {
  'claude-opus-5': { maxOutputTokens: 128_000, refusalFallback: true },
  'claude-sonnet-5': { maxOutputTokens: 128_000, refusalFallback: false },
  'claude-haiku-4-5': { maxOutputTokens: 64_000, refusalFallback: false },
};

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
  private readonly anthropic: AnthropicProvider | null;
  private readonly generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

  constructor(
    private readonly tools: AiTools,
    private readonly conversations: ConversationsService,
    private readonly config: AppConfigService,
  ) {
    const apiKey = config.get('ANTHROPIC_API_KEY');
    this.anthropic = apiKey ? createAnthropic({ apiKey }) : null;
    if (!apiKey) this.logger.warn('ANTHROPIC_API_KEY is not set — POST /api/ai/chat will return 503.');
  }

  /**
   * Steps 1–9 above for one request, streamed into `response`. Throws HTTP
   * exceptions only before the first byte is written; later failures become an
   * error part in the stream.
   */
  async streamChat({ user, request, response, abortSignal }: StreamChatParams): Promise<void> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException('AI is not configured. Set ANTHROPIC_API_KEY in backend/.env.');
    }
    // Dates the user mentions ("signed in yesterday") are days in their zone.
    const { timeZone } = request;
    // The role check: the model is never offered a tool this user may not use
    // (nor a form tool when components are off: there would be no form to show).
    const activeTools = this.tools.activeFor(user, request.generateUi);
    // Forms the role allows, and those it doesn't: the prompt names them where
    // no form tool is offered, so Claude can say how to get one, or who can.
    const forms = this.tools.formsFor(user);
    // The pickers' choices (and, for the form tools on offer, the records they
    // take): listed in the prompt, and the only ids the tools accept.
    const options = await this.tools.filterOptions(user, activeTools);
    const tools = this.tools.create({ user, timeZone, options });
    const effort = effortFor(request);

    // 1–3 [app] The conversation this turn continues: extended, validated, saved.
    const stored = await this.conversations.messages(request.id, user.id);
    const messages = await validate(nextHistory(stored, request), tools);
    await this.conversations.save(request.id, user.id, messages);

    // 4 [app] One call to streamText. It runs steps 5–7 by itself: [AI] Claude
    // answers or calls tools, [app] the SDK runs their `execute`, [AI] Claude
    // reads the results, and so on until it stops calling tools.
    const result = streamText({
      model: this.anthropic(request.model),
      instructions: buildInstructions({ user, timeZone, generateUi: request.generateUi, forms, options }),
      messages: await convertToModelMessages(forModel(messages, request.model), { tools }),
      tools,
      activeTools,
      stopWhen: isStepCount(this.config.get('AI_MAX_STEPS')),
      maxOutputTokens: Math.min(this.config.get('AI_MAX_OUTPUT_TOKENS'), MODEL_LIMITS[request.model].maxOutputTokens),
      providerOptions: { anthropic: this.anthropicOptions(request.model, effort) },
      abortSignal,
    });

    console.log('RESULT');
    console.log(result.stream);
    console.log("================");

    // 8–9 [app] Stream every part to the browser, then save the finished turn.
    const stream = toUIMessageStream<AiToolSet, GenUIMessage>({
      stream: result.stream,
      tools,
      originalMessages: messages,
      generateMessageId: this.generateMessageId,
      sendReasoning: this.config.get('AI_SEND_REASONING'),
      // Saved with the answer: the chat labels it and keeps rendering it in its mode.
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return { model: request.model, effort, createdAt: Date.now(), generateUi: request.generateUi };
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

    console.log("================");
    console.log("STREAM");
    console.log(stream);
    console.log("================");

    await pipeUIMessageStreamToResponse({ response, stream });
  }

  /**
   * Anthropic-specific options. Models with an effort level think adaptively;
   * Claude Haiku 4.5 gets neither option, since it would reject both. Never
   * add `budgetTokens`, `temperature` or `topP`: the Claude 5 models answer
   * those with a 400.
   */
  private anthropicOptions(model: AssistantModel, effort: Effort | undefined) {
    if (!effort) return {};
    return {
      // "summarized" streams a readable summary of the thinking; the default streams it empty.
      thinking: { type: 'adaptive', display: this.config.get('AI_SEND_REASONING') ? 'summarized' : 'omitted' },
      effort,
      ...(this.config.get('AI_REFUSAL_FALLBACK') &&
        MODEL_LIMITS[model].refusalFallback && { fallbacks: 'default' as const }),
    } satisfies AnthropicLanguageModelOptions;
  }
}

/** The effort this request runs at, or `undefined` for a model without effort levels. */
function effortFor(request: ChatRequest): Effort | undefined {
  return ASSISTANT_MODELS[request.model].effort ? (request.effort ?? DEFAULT_EFFORT) : undefined;
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
  // The Claude 5 models don't accept an assistant prefill, so the turn must end with the user.
  if (result.at(-1)?.role !== 'user') {
    throw new BadRequestException('The last message must come from the user');
  }
  return result;
}

/**
 * Thinking belongs to the model that wrote it. After a switch of model,
 * earlier answers are sent without their reasoning (the saved copy keeps it).
 */
function forModel(messages: GenUIMessage[], model: AssistantModel): GenUIMessage[] {
  return messages.map((message) =>
    message.role === 'assistant' && message.metadata?.model !== model
      ? { ...message, parts: message.parts.filter((part) => part.type !== 'reasoning') }
      : message,
  );
}

/** A call that failed before producing anything leaves an empty answer; don't save it. */
function withoutEmptyAnswer(messages: GenUIMessage[]): GenUIMessage[] {
  const last = messages.at(-1);
  const empty = last?.role === 'assistant' && !last.parts.some((part) => part.type !== 'step-start');
  return empty ? messages.slice(0, -1) : messages;
}
