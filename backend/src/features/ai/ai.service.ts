import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createAnthropic, type AnthropicLanguageModelOptions, type AnthropicProvider } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  createIdGenerator,
  generateText,
  isStepCount,
  isToolUIPart,
  pipeUIMessageStreamToResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from 'ai';
import type { ServerResponse } from 'node:http';
import {
  ASSISTANT_MODELS,
  DEFAULT_EFFORT,
  isHelperToolPart,
  MAX_CONVERSATION_MESSAGES,
  type AssistantModel,
  type ChatRequest,
  type Effort,
  type GenUIMessage,
} from '@gen-ui/shared';
import { AppConfigService } from '../../config/app-config.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AiInstructionsService } from './ai-instructions.service.js';
import { AiTools, type AiToolSet } from './ai.tools.js';
import {
  cleanTitle,
  firstQuestion,
  provisionalTitle,
  TITLE_INSTRUCTIONS,
  TITLE_MODEL,
  TITLE_QUESTION_LENGTH,
} from './conversation-title.js';
import { ConversationsService } from './conversations.service.js';
import { DashboardDraftsService } from './dashboard-drafts.service.js';
import { buildInstructions, withSessionStamps } from './system-prompt.js';

/*
 * ════════════════════════════════════════════════════════════════════════════
 *  The assistant, end to end: one POST /api/ai/chat
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  [app] our code: deterministic, same input → same result
 *  [AI]  decided by Claude while the request runs
 *
 *  1 [app] Load the saved conversation (none yet for a new chat: its id
 *          comes from the browser) and add the new question, with the time
 *          it is asked.
 *  2 [app] Validate all of it against the tool contracts.
 *  3 [app] Save it, so the question survives a failed model call. A new
 *          chat's row is created here, titled with the question.
 *     [AI] For a new chat, Claude Haiku writes a short title meanwhile
 *          (conversation-title.ts); step 9 saves it.
 *  4 [app] Call the chosen model with the system prompt (system-prompt.ts),
 *          the history, and the tools this user's role may use (ai.tools.ts).
 *          The prompt starts with the standing instructions admins edit on
 *          the Settings page (ai-instructions.service.ts), and is marked for
 *          Anthropic's prompt cache, so its unchanged start isn't processed
 *          again on the next request or tool round.
 *          The prompt lists the assets, people and shift templates the
 *          pages' pickers offer, so Claude can fill those filters with
 *          their ids. Lists a tool on offer takes by id are added: devices,
 *          tags, alarm rules and the user's own latest logbook entries. A
 *          device, tag or rule list longer than AI_PICK_LIST_INLINE_MAX is
 *          left out, and Claude looks up what it needs with the `lookup`
 *          helper tool (offered only then; the chat never draws it).
 *          The clocks come with the history instead, so they don't undo the
 *          cache: Claude's copy of each question starts with when it was
 *          sent, on the user's clock and on the plant's, which shift dates
 *          are on.
 *  5 [AI]  Claude decides what to do: answer, politely refuse an off-topic
 *          request, or call tools, choosing which tools, their filters, and
 *          how many to run at once.
 *  6 [app] The AI SDK runs every tool call: AiTools → the domain's service
 *          (UsersService, AlarmsService, AlarmDefinitionsService,
 *          LogbookService, DevicesService, TagsService, AssetsService,
 *          TelemetryService, ShiftsService, AuditService) → database.
 *          The calls of one response run at the same time, once Claude has
 *          written them all.
 *  7 [AI]  Claude reads the tool results and writes the answer. Steps 5–7
 *          repeat until it answers without calling a tool (at most
 *          AI_MAX_STEPS rounds). A stream silent for SILENCE_TIMEOUT_MS is
 *          cut off.
 *  8 [app] Each part (text, reasoning, tool input and output) streams to the
 *          browser as it is produced, over Server-Sent Events.
 *  9 [app] When the stream ends (also after Stop or a closed tab), save the
 *          conversation; a tool call cut off mid-run is saved as stopped.
 *          A new chat gets its title now, before the response ends, so the
 *          browser's list shows it as soon as the answer is done.
 *
 *  Form tools (add a user; create or edit an alarm rule, a device, a tag, an
 *  asset, a logbook entry or a shift template; schedule, edit or copy shifts)
 *  only open the app's own form in the answer. The user saves it later
 *  through the page's REST endpoint, and the browser reports the outcome to
 *  PUT /ai/conversations/:id/forms/:toolCallId (ai-forms.service.ts).
 *  A dashboard draft (createDashboard) is saved on the Dashboard page, which
 *  records the draft on the dashboard; step 4 tells Claude which drafts are
 *  saved, and as what (dashboard-drafts.service.ts).
 *
 *  In the browser a fixed registry turns each tool part into a React
 *  component (frontend/src/features/assistant/lib/tool-renderers.ts). Claude chooses
 *  the tool and its filters; it never writes UI code or data of its own.
 */

/** The most output tokens each model allows in one response. */
const MAX_OUTPUT_TOKENS: Record<AssistantModel, number> = {
  'claude-sonnet-5': 128_000,
  'claude-haiku-4-5': 64_000,
};

/**
 * How long a round may go without anything new (thinking, text, tool input)
 * before the answer is cut off, so a stalled stream doesn't keep the user waiting.
 * A limit on silence, not on length: an answer that keeps streaming is never cut.
 * The SDK's timer also runs while the tools execute, and thinking that isn't
 * shown (AI_SEND_REASONING off) counts as silence too. Running out ends the
 * answer like Stop: what came so far is saved.
 */
const SILENCE_TIMEOUT_MS = 60_000;

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
    private readonly instructions: AiInstructionsService,
    private readonly conversations: ConversationsService,
    private readonly drafts: DashboardDraftsService,
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
    // The standing instructions: an admin's, or the built-in ones.
    const [options, base] = await Promise.all([
      this.tools.filterOptions(user, activeTools),
      this.instructions.current(),
    ]);
    // The lookup stands in for the lists too long for the prompt: with none, it isn't offered.
    const offered = options.deferred.length > 0 ? activeTools : activeTools.filter((name) => name !== 'lookup');
    const tools = this.tools.create({ user, timeZone, options });
    const effort = effortFor(request);

    // 1–3 [app] The conversation this turn continues: extended, validated, saved.
    const stored = await this.conversations.messages(request.id, user.id);
    const messages = askedNow(await validate(nextHistory(stored, request), tools));
    await this.conversations.start(request.id, user.id, messages);

    // [AI] A new chat's title, written while the answer streams; saved in step 9.
    const title = stored.length === 0 ? this.writeTitle(firstQuestion(messages)) : undefined;

    // Claude's copy of the history says which dashboard drafts were saved since, and as
    // what, and starts each question with when it was sent (its <session> block); the
    // copy that is streamed and saved stays as it was.
    const forClaude = withSessionStamps(
      forModel(await this.drafts.withStatus(messages, request.id), request.model),
      timeZone,
      options.plantTimeZone,
    );

    // 4 [app] One call to streamText. It runs steps 5–7 by itself: [AI] Claude
    // answers or calls tools, [app] the SDK runs their `execute`, [AI] Claude
    // reads the results, and so on until it stops calling tools.
    const maxSteps = this.config.get('AI_MAX_STEPS');
    const result = streamText({
      model: this.anthropic(request.model),
      instructions: buildInstructions({ base, user, timeZone, generateUi: request.generateUi, forms, options }),
      messages: await convertToModelMessages(forClaude, { tools, ignoreIncompleteToolCalls: true }),
      tools,
      activeTools: offered,
      stopWhen: isStepCount(maxSteps),
      // Before a round's first output, then between outputs.
      timeout: { firstChunkMs: SILENCE_TIMEOUT_MS, chunkMs: SILENCE_TIMEOUT_MS },
      maxOutputTokens: Math.min(this.config.get('AI_MAX_OUTPUT_TOKENS'), MAX_OUTPUT_TOKENS[request.model]),
      providerOptions: { anthropic: this.anthropicOptions(effort) },
      abortSignal,
      onStepEnd: ({ stepNumber, toolCalls, usage }) => {
        // Several tools in one step: Claude called them in parallel, and they ran at the same time.
        const toolNames = toolCalls.map((call) => call.toolName);
        console.log(`step ${stepNumber}`, 'tools:', toolNames, usage.inputTokenDetails, 'total input:', usage.inputTokens);
      },
      // A stream cut off for silence ends like Stop, so say in the log why it ended.
      onAbort: ({ reason }) => {
        if (reason instanceof Error && reason.name === 'TimeoutError') {
          this.logger.warn(`Chat answer cut off: ${reason.message}`);
        }
      },
    });

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
      // Also runs when the user presses Stop or the tab closes, so a partial answer is kept.
      // The response ends only once this has run, so the browser reads the saved chat after it.
      onEnd: async ({ messages: updated }) => {
        try {
          await this.conversations.finish(request.id, user.id, withoutEmptyAnswer(withStoppedToolCalls(updated)));
          const written = await title;
          if (written) await this.conversations.retitle(request.id, user.id, provisionalTitle(messages), written);
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

  /**
   * A short title for a chat that starts with `question`, from the cheapest
   * model whichever one answers. `null` when it fails or says nothing usable:
   * the chat keeps its first question as the title. Never rejects.
   */
  private async writeTitle(question: string): Promise<string | null> {
    if (!this.anthropic || !question) return null;
    try {
      const { text } = await generateText({
        model: this.anthropic(TITLE_MODEL),
        instructions: TITLE_INSTRUCTIONS,
        prompt: question.slice(0, TITLE_QUESTION_LENGTH),
        maxOutputTokens: 32,
        abortSignal: AbortSignal.timeout(10_000),
      });
      return cleanTitle(text);
    } catch (error) {
      this.logger.warn(`Writing a chat title failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Anthropic-specific options. `cacheControl` caches the whole prompt up to
   * its last message, so each tool round, and the next question within five
   * minutes, reads the conversation before it from the cache (system-prompt.ts
   * marks the earlier breakpoints, and keeps the clocks out of the system
   * prompt so nothing before the conversation changes). Models with an
   * effort level think adaptively; Claude Haiku 4.5 gets neither option,
   * since it would reject both. Never add `budgetTokens`, `temperature` or
   * `topP`: the Claude 5 models answer those with a 400.
   */
  private anthropicOptions(effort: Effort | undefined) {
    const caching = { cacheControl: { type: 'ephemeral' } } satisfies AnthropicLanguageModelOptions;
    if (!effort) return caching;
    return {
      ...caching,
      // "summarized" streams a readable summary of the thinking; the default streams it empty.
      thinking: { type: 'adaptive', display: this.config.get('AI_SEND_REASONING') ? 'summarized' : 'omitted' },
      effort,
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
    throw new BadRequestException('This conversation is full. Start a new chat to go on.');
  }
  const validated = await safeValidateUIMessages<GenUIMessage>({ messages, tools });
  if (!validated.success) {
    throw new BadRequestException(
      `This conversation can't be continued (${validated.error.message}). Start a new chat to go on.`,
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
 * The history with the question this turn answers marked as asked now
 * (`metadata.createdAt`): Claude reads that as the current time
 * (withSessionStamps in system-prompt.ts). Also a re-sent question and one
 * asked again with "Try again", so the answer is about the moment it's given.
 * The server's time, not the browser's (the browser sends no metadata), and
 * saved with the question, so Claude sees the same time for it on every later
 * turn.
 */
function askedNow(messages: GenUIMessage[]): GenUIMessage[] {
  const question = messages.at(-1);
  // validate() already made sure the last message is the user's.
  if (question?.role !== 'user') return messages;
  return [...messages.slice(0, -1), { ...question, metadata: { createdAt: Date.now() } }];
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

const STOPPED_TOOL_CALL = 'Stopped before it finished.';

/**
 * An answer cut off mid tool call (Stop, a closed or reloaded tab) ends with
 * calls that have no result. A call Claude was still writing is dropped (it
 * never ran, and its input is incomplete); one that was running is saved as
 * stopped, so the chat shows that instead of a skeleton and Claude reads it as
 * a call that didn't finish.
 */
function withStoppedToolCalls(messages: GenUIMessage[]): GenUIMessage[] {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return messages;
  const unfinished = (part: GenUIMessage['parts'][number]) =>
    isToolUIPart(part) && (part.state === 'input-streaming' || part.state === 'input-available');
  if (!last.parts.some(unfinished)) return messages;

  const parts = last.parts.flatMap((part): GenUIMessage['parts'] => {
    if (!isToolUIPart(part) || !unfinished(part)) return [part];
    if (part.state === 'input-streaming') return [];
    return [{ ...part, state: 'output-error', errorText: STOPPED_TOOL_CALL } as GenUIMessage['parts'][number]];
  });
  return [...messages.slice(0, -1), { ...last, parts }];
}

/**
 * A call that failed before producing anything leaves an empty answer; don't
 * save it. Neither one stopped after only a lookup, which the chat wouldn't
 * draw: it would show as a blank answer.
 */
function withoutEmptyAnswer(messages: GenUIMessage[]): GenUIMessage[] {
  const last = messages.at(-1);
  const empty =
    last?.role === 'assistant' && !last.parts.some((part) => part.type !== 'step-start' && !isHelperToolPart(part));
  return empty ? messages.slice(0, -1) : messages;
}
