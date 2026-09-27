# AI assistant — end-to-end flow

How one chat message becomes a rendered answer, how a conversation is saved and restored, and which layer calls which.

Example request: *"Get me all admins, and also users named John."*

## 1. One message: request → tools → database → stream → render

```mermaid
flowchart TD
  subgraph FE1["1 · Frontend: send"]
    U(["User: 'Get me all admins, and also users named John'"])
    TH["ChatThread · sendMessage(text)"]
    PREF{{"Toggle 'Generate UI components'<br/>assistant-preferences · default on"}}
    CTX["useAssistantContext()<br/>pathname · page title · summary"]
    TR["chat-store transport<br/>body: id, trigger, the new message only,<br/>context, generateUi"]
    AF["authFetch<br/>Bearer access token · refresh + retry once on 401"]
    U --> TH --> TR
    PREF --> TR
    CTX --> TR
    TR --> AF
  end

  AF -- "POST /api/ai/chat" --> GUARD

  subgraph BE1["2 · Backend: prepare"]
    GUARD["JwtAuthGuard · any signed-in role"]
    CTRL["AiController.chat<br/>ChatRequestSchema validates the body<br/>AbortController tied to response close"]
    KEY{"ANTHROPIC_API_KEY set?"}
    E503["503 · AI is not configured"]
    HIST["ConversationsService.messages(id, user)<br/>another user's id → 404"]
    MERGE["submit: append the message<br/>regenerate: drop a trailing answer<br/>max 200 messages"]
    VAL["safeValidateUIMessages against the tool schemas<br/>last message must be the user's"]
    SAVE1["save the conversation<br/>the question survives a failed model call"]
    PROMPT["buildInstructions<br/>generic rules + app map + guardrail<br/>+ components or text-only section<br/>+ session: user, role, page"]
    ROLES["AiTools.activeFor(user)<br/>TOOL_ROLES · the chat's @Roles"]
    CALL["streamText<br/>model · instructions · history · tools<br/>activeTools · stopWhen AI_MAX_STEPS · abortSignal"]
    GUARD --> CTRL --> KEY
    KEY -- no --> E503
    KEY -- yes --> HIST --> MERGE --> VAL --> SAVE1
    SAVE1 --> PROMPT --> CALL
    SAVE1 --> ROLES --> CALL
  end

  CDB[("PostgreSQL · conversations<br/>messages as jsonb")]
  CDB -.->|stored messages| HIST
  SAVE1 --> CDB

  CALL -- "request" --> LLM

  subgraph AI["3 · Vercel AI SDK and Claude"]
    LLM{"Claude decides"}
    OFF["Unrelated to the app<br/>one polite sentence, no tool call"]
    CALLS["Parallel tool calls in one step<br/>listUsers title 'Admins', role ADMIN<br/>listUsers title 'Users named John', search 'John'"]
    FINAL["Final text<br/>components on: one short sentence<br/>components off: Markdown table"]
    LLM -- "off-topic" --> OFF
    LLM -- "needs data" --> CALLS
    LLM -- "has tool results" --> FINAL
  end

  CALLS -- "SDK runs each execute" --> EXEC

  subgraph BE2["4 · Backend: tool execution, once per call"]
    EXEC["AiTools · listUsers.execute<br/>ListUsersQuerySchema.parse(filters, pageSize 20)"]
    SVC["UsersService.list"]
    REPO["UsersRepository.list · Prisma"]
    DB[("PostgreSQL · users")]
    RES["Tool result<br/>total + up to 20 rows: name, email, role, status"]
    EXEC --> SVC --> REPO --> DB
    DB --> RES
  end

  RES -- "next step: results go back to Claude" --> LLM

  subgraph BE3["5 · Backend: stream and save"]
    UIS["toUIMessageStream<br/>message ids · metadata: model, createdAt, generateUi, finishReason"]
    SSE["pipeUIMessageStreamToResponse<br/>Server-Sent Events"]
    ONEND["onEnd: save the full conversation<br/>also after Stop"]
    UIS --> SSE
    UIS --> ONEND
  end

  ONEND --> CDB
  OFF --> UIS
  CALLS -- "tool input streams as it is generated" --> UIS
  RES --> UIS
  FINAL --> UIS

  SSE -- "text/event-stream" --> CHAT

  subgraph FE2["6 · Frontend: render the parts"]
    CHAT["useChat · message.parts"]
    KIND{"part type"}
    MD["text → Markdown"]
    RSN["reasoning → collapsed Reasoning"]
    MODE{"message.metadata.generateUi"}
    SKEL["input-streaming → skeleton"]
    VIEW["input complete → card titled 'Admins'<br/>UsersTable built from the tool input<br/>Open in new tab ↗ /users?role=ADMIN"]
    ERR["output-error → alert"]
    LINE["components off → one muted line<br/>'Admins · 2 found · Open in new tab ↗'"]
    CHAT --> KIND
    KIND -- text --> MD
    KIND -- reasoning --> RSN
    KIND -- "tool-listUsers" --> MODE
    MODE -- on --> SKEL --> VIEW
    MODE -- on --> ERR
    MODE -- off --> LINE
  end

  VIEW -- "live fetch, same as the Users page<br/>GET /api/users?role=ADMIN · pageSize 5" --> UCTRL
  UCTRL["UsersController.list<br/>@Roles ADMIN, USER"] --> SVC
```

**Reading it:**
- **Two data paths reach `UsersService`.** The tool's `execute` gives Claude up to 20 rows to reason over. The table in the chat fetches its own data through the REST API, exactly like the Users page, so it pages, sorts and authorizes the same way.
- **The tool input is a page query.** Apart from `title`, every field of `listUsers` is also a `/users` URL parameter. That is why "Open in new tab" can reproduce the table as a full page.
- **Parallel calls.** Claude can emit several tool calls in one step; each renders as its own titled table, in order.

## 2. Conversation lifecycle: open, restore, clear, sign out

```mermaid
flowchart TD
  OPEN(["Open the assistant panel or /assistant"]) --> LOADED{"Chat already loaded<br/>in this tab?"}
  LOADED -- yes --> SHOW["Show the thread"]
  LOADED -- no --> GET["GET /api/ai/conversations/latest"]
  GET --> HAS{"Saved conversation?"}
  HAS -- yes --> RESTORE["new Chat with its id and messages<br/>every part re-renders: text, reasoning,<br/>tables rebuilt from their stored query"]
  HAS -- no --> FRESH["new Chat with a random UUID<br/>the row is created on the first message"]
  RESTORE --> SHOW
  FRESH --> SHOW
  SHOW --> CLEAR(["Clear chat"])
  CLEAR --> CONFIRM{"Confirm?"}
  CONFIRM -- yes --> DEL["DELETE /api/ai/conversations/:id"]
  DEL --> FRESH
  CONFIRM -- no --> SHOW
  SIGNOUT(["Sign out"]) --> DROP["Stop any stream and forget the chat<br/>the next user loads their own"]
```

**Why components come back by themselves:** a message is saved with its `parts`: text, reasoning, and each tool call with its input and output. The chat renders purely from parts, so a restored conversation looks as it did. Tables rebuild from their stored *query*, so they show current data, while the text above them says what was true then.

**Why the server owns the history:** the client sends only its new message. The conversation follows the user to any browser, requests stay small, and a client can't rewrite past tool results that Claude will read. The cost: every turn sends the whole saved conversation to Claude, so clearing a long chat also makes the next answers cheaper.

## 3. Layering: who calls whom

```mermaid
flowchart LR
  subgraph IN["Inbound adapters · siblings"]
    HTTP["UsersController<br/>JWT guard + @Roles<br/>Zod query pipe"]
    TOOL["AiTools · listUsers<br/>TOOL_ROLES → activeTools<br/>Zod tool input"]
  end
  SVC["UsersService<br/>rules · PublicUser mapping · audit on writes"]
  REPO["UsersRepository<br/>Prisma queries"]
  DB[("PostgreSQL")]
  HTTP --> SVC
  TOOL --> SVC
  SVC --> REPO --> DB
  TOOL -.->|never| HTTP
  TOOL -.->|never| REPO
```

A tool is an inbound adapter, like a controller: both translate an outside request into a call on the service layer, where the business rules live. Nest's guards and pipes don't run for tool calls, so the tool layer brings its own role map (`TOOL_ROLES`) and validation (the Zod tool input, then the same `ListUsersQuerySchema` the HTTP endpoint uses).

## Adding the next domain

1. **Contract:** add the tool's schema to `genUiToolSchemas` in `packages/shared/src/assistant.ts`, with a `description` and a `.describe()` on every field. That text is how Claude learns the tool.
2. **Tool:** add it in `backend/src/features/ai/ai.tools.ts`, calling that domain's service, plus one `TOOL_ROLES` line. Import the domain's module in `ai.module.ts`.
3. **Renderer:** add an entry in `frontend/src/features/assistant/tool-parts.tsx` that wraps the domain's existing table and links to its page.

The system prompt doesn't change. TypeScript fails the build if the backend tools and the shared contract drift apart, or if a tool has no renderer.

## Where the code lives

| Step | File |
|---|---|
| Toggle, panel open state | `frontend/src/features/assistant/assistant-preferences.ts` |
| Load, send, clear, auth | `frontend/src/features/assistant/chat-store.ts` |
| Thread, toolbar, composer | `frontend/src/features/assistant/chat-thread.tsx` |
| Render parts, Markdown | `frontend/src/features/assistant/chat-message.tsx` |
| Tool → component registry | `frontend/src/features/assistant/tool-parts.tsx` |
| "Open in new tab" link | `frontend/src/components/view-card.tsx` |
| The users table (page and chat) | `frontend/src/features/users/users-table.tsx` |
| Contract: request, tools, messages | `packages/shared/src/assistant.ts` |
| Endpoints | `backend/src/features/ai/ai.controller.ts` |
| Model call, stream, save | `backend/src/features/ai/ai.service.ts` |
| Saved conversations | `backend/src/features/ai/conversations.service.ts` |
| Tools and role map | `backend/src/features/ai/ai.tools.ts` |
| System prompt and guardrail | `backend/src/features/ai/system-prompt.ts` |
