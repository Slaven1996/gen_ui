import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
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
  ConversationListSchema,
  ConversationSchema,
  ConversationSummarySchema,
  DashboardDraftResponseSchema,
  FormOutcomeRequestSchema,
  FormToolOutputSchema,
  ListConversationsQuerySchema,
  RenameConversationSchema,
  type ChatRequest,
  type Conversation,
  type ConversationList,
  type ConversationSummary,
  type DashboardDraftResponse,
  type FormOutcomeRequest,
  type FormToolOutput,
  type ListConversationsQuery,
  type RenameConversationDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AiFormsService } from './ai-forms.service.js';
import { AiService } from './ai.service.js';
import { ConversationsService } from './conversations.service.js';
import { DashboardDraftsService } from './dashboard-drafts.service.js';

@ApiTags('Assistant')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly conversations: ConversationsService,
    private readonly forms: AiFormsService,
    private readonly drafts: DashboardDraftsService,
  ) {}

  /**
   * Streams an AI SDK UI message stream (SSE) consumed by `useChat`.
   * Guards (JWT) still run with `@Res()`; only interceptors are bypassed.
   */
  @Post('chat')
  @ApiOperation({
    summary: 'Ask the assistant',
    description:
      'Continues your conversation `id` (a new id starts a new chat, created by this first message): send only the new `message`, or `trigger: "regenerate-message"` to answer the last question again. `model` picks the Claude model (default Claude Haiku 4.5) and `effort` its effort level (ignored by Haiku). `timeZone` is where "today" and the dates you mention are read. Streams an AI SDK UI message stream over SSE, so the reply arrives as `data:` frames rather than one JSON body — Swagger UI shows it as raw text. Parts of the answer are tool calls the web app renders as React components unless `generateUi` is false. The first answer of a new chat also has Claude Haiku write the chat a short title, saved before the stream ends. Every call spends provider tokens.',
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

  @Get('conversations')
  @ApiOperation({
    summary: 'Your chats',
    description:
      "Your conversations, latest activity first (a question, an answer, a form saved in it; renaming doesn't count), without their messages. A chat exists once its first message is sent. Its `title` is that question until the first answer ends, then a short title Claude wrote, or the one you gave it.",
  })
  @ApiOkResponse({ standardSchema: ConversationListSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  list(
    @Query({ schema: ListConversationsQuerySchema }) query: ListConversationsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<ConversationList> {
    return this.conversations.list(user.id, query);
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary: 'One of your chats',
    description: 'A conversation of yours with every message, parts included, so the web app can render it again.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: ConversationSchema })
  @ApiErrorResponse(400, '`id` is not a UUID.')
  @ApiErrorResponse(404, 'No such conversation of yours (it may have been deleted).')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<Conversation> {
    return this.conversations.get(id, user.id);
  }

  @Patch('conversations/:id')
  @ApiOperation({
    summary: 'Rename a chat',
    description: 'Gives one of your conversations a title of your own. It keeps its place in your list. No model call.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: ConversationSummarySchema })
  @ApiErrorResponse(400, '`id` is not a UUID, or `title` is empty or too long.')
  @ApiErrorResponse(404, 'No such conversation of yours.')
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: RenameConversationSchema }) body: RenameConversationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConversationSummary> {
    return this.conversations.rename(id, user.id, body.title);
  }

  @Put('conversations/:id/forms/:toolCallId')
  @ApiOperation({
    summary: 'Record what happened to a form',
    description:
      'When the assistant opens a form in an answer (add a user; create or edit an alarm rule, a device, a tag, an asset, a logbook entry or a shift template; schedule, edit or copy shifts), the tool call ends there and the user saves through the same endpoint the page uses, as from the modal. The web app then calls this with `saved` and the id of the saved record (plus `entityIds`, every record, for a form that saves several: a repeating shift, a copied week, a change to the rest of a series), or with `closed` when the form was closed unsaved. The server reads the records and adds the outcome to the output of that tool call in the saved conversation, so a reload shows the result instead of the form and Claude knows on its next turn. Once per form. No model call.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'The conversation.' })
  @ApiParam({ name: 'toolCallId', description: "The form tool call's id, from its part in the conversation." })
  @ApiOkResponse({ standardSchema: FormToolOutputSchema, description: "The tool call's output, now with `outcome`." })
  @ApiErrorResponse(400, '`id` is not a UUID, the body is malformed, or `entityId` is not the record this form edits.')
  @ApiErrorResponse(403, 'Your role may not use this form.')
  @ApiErrorResponse(404, 'No such conversation of yours, no form with that id in it, or no record with `entityId` (or `entityIds`).')
  @ApiErrorResponse(409, 'The form is already saved or closed.')
  recordFormOutcome(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('toolCallId') toolCallId: string,
    @Body({ schema: FormOutcomeRequestSchema }) body: FormOutcomeRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<FormToolOutput> {
    return this.forms.recordOutcome(id, toolCallId, body, user);
  }

  @Get('conversations/:id/dashboard-drafts/:toolCallId')
  @ApiOperation({
    summary: 'Open a dashboard draft',
    description:
      'A dashboard the assistant put together in one of your conversations (a `createDashboard` call): its name, sharing and widgets as the call proposed them, for the Dashboard page to open as an unsaved dashboard. `dashboard` is the one saved from it (`POST /dashboards` with `source`), under its current name, or null while none is: deleting that dashboard makes it null again. No model call.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'The conversation.' })
  @ApiParam({ name: 'toolCallId', description: "The `createDashboard` call's id, from its part in the conversation." })
  @ApiOkResponse({ standardSchema: DashboardDraftResponseSchema })
  @ApiErrorResponse(400, '`id` is not a UUID.')
  @ApiErrorResponse(404, 'No such conversation of yours (it may have been deleted), or no dashboard draft with that id in it.')
  dashboardDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('toolCallId') toolCallId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DashboardDraftResponse> {
    return this.drafts.get(id, toolCallId, user);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a chat',
    description:
      'Deletes one of your conversations for good. Dashboards saved from its drafts stay; their draft links stop working. An unknown id is not an error.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted, or there was nothing to delete.' })
  @ApiErrorResponse(400, '`id` is not a UUID.')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.conversations.remove(id, user.id);
  }
}
