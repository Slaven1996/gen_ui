import { useSyncExternalStore } from 'react';
import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { isFormToolPart, type Conversation, type FormToolOutput, type GenUIMessage } from '@gen-ui/shared';
import { API_BASE_URL } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { queryClient } from '@/lib/api/query-client';
import { authStore } from '@/lib/auth/auth-store';
import { refreshSession } from '@/lib/auth/refresh';
import { tokenStore } from '@/lib/auth/token-store';
import { browserTimeZone } from '@/lib/search';
import { conversationKeys } from '../api/queries';
import { getAssistantEffort, getAssistantModel, getGenerateUi } from './assistant-preferences';

/*
 * The browser side of the chats. Nothing here is AI-driven: it restores a
 * saved conversation, sends each new question with the user's settings
 * (model, effort, components on/off) and time zone, and hands the
 * streamed answer to `useChat`, which rebuilds the message parts as they arrive.
 */

/**
 * `fetch` for the streaming chat endpoint (axios can't consume streams):
 * attaches the in-memory access token and refreshes + retries once on 401.
 */
const authFetch: typeof fetch = async (input, init) => {
  const send = () => {
    const headers = new Headers(init?.headers);
    const token = tokenStore.get();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  if (!tokenStore.isFresh(5_000)) await refreshSession().catch(() => undefined);

  const response = await send();
  if (response.status !== 401) return response;

  const result = await refreshSession();
  if (result === 'refreshed') return send();
  authStore.clearSession();
  return response;
};

/** `crypto.randomUUID` needs a secure context; plain-http LAN access still gets a v4 UUID. */
function newConversationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  // Version 4, RFC 4122 variant — what the API's `z.uuid()` accepts.
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20)}`;
}

/** The chat list in the sidebar: a chat was created or moved up, or got its title. */
function refreshList(): void {
  void queryClient.invalidateQueries({ queryKey: conversationKeys.list });
}

/**
 * `fetch` for one turn. Once the server answers, it has saved the question
 * (on a new chat's first message, created the chat), so the list is refreshed.
 */
const turnFetch: typeof fetch = async (input, init) => {
  const response = await authFetch(input, init);
  if (response.ok) refreshList();
  return response;
};

function createChat(conversationId = newConversationId(), saved: GenUIMessage[] = []): Chat<GenUIMessage> {
  return new Chat<GenUIMessage>({
    id: conversationId,
    messages: saved,
    transport: new DefaultChatTransport<GenUIMessage>({
      api: `${API_BASE_URL}/ai/chat`,
      fetch: turnFetch,
      // The server keeps the conversation, so only what is new goes up, with
      // the settings as they are right now (`ChatRequestSchema` in @gen-ui/shared).
      prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
        body: {
          id,
          trigger,
          message: trigger === 'submit-message' ? messages.at(-1) : undefined,
          // "Today" and the dates the user mentions are days in this zone.
          timeZone: browserTimeZone,
          generateUi: getGenerateUi(),
          model: getAssistantModel(),
          effort: getAssistantEffort(),
        },
      }),
    }),
    // The response ends once the server has saved the answer, and a new chat's title with it.
    onFinish: () => {
      refreshList();
      forgetIdle();
    },
  });
}

/*
 * The user's chats in this tab, each an AI SDK `Chat`, so an answer keeps
 * arriving while the user is on another chat or page, and shows live when
 * they come back. A chat is loaded from the server the first time it is
 * shown. `/assistant` without a chat shows the draft: a new chat with an id
 * but nothing saved yet, which its first message creates on the server.
 * Everything is forgotten on sign-out, so the next user loads their own.
 */
const chats = new Map<string, Chat<GenUIMessage>>();
const loads = new Map<string, Promise<void>>();
let draftId: string | undefined;
/** Bumped on sign-out, so a load that was still running can't install the old user's chat. */
let session = 0;
const listeners = new Set<() => void>();

/** Chats kept beyond this many are forgotten, oldest first, unless answering; they reload when shown. */
const MAX_CHATS = 10;

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Most recently shown last. */
function touch(id: string): void {
  const chat = chats.get(id);
  if (!chat) return;
  chats.delete(id);
  chats.set(id, chat);
}

function forgetIdle(): void {
  let excess = chats.size - MAX_CHATS;
  const shown = [...chats.keys()].at(-1);
  for (const [id, chat] of chats) {
    if (excess <= 0) return;
    if (id === shown || id === draftId || chat.status === 'submitted' || chat.status === 'streaming') continue;
    chats.delete(id);
    excess -= 1;
  }
}

/**
 * Shows a saved chat: the one in memory, or loaded from the server. Showing
 * the draft by its id (after its first message) makes it an ordinary chat.
 * Safe to call repeatedly.
 */
export function openChat(id: string): Promise<void> {
  if (chats.has(id)) {
    if (id === draftId) draftId = undefined;
    touch(id);
    return Promise.resolve();
  }
  let loading = loads.get(id);
  if (!loading) {
    const started = session;
    loading = http
      .get<Conversation>(`/ai/conversations/${id}`)
      .then(({ data }) => {
        if (started !== session || chats.has(id)) return;
        chats.set(id, createChat(data.id, data.messages));
        forgetIdle();
        notify();
      })
      .finally(() => {
        if (started === session) loads.delete(id);
      });
    loads.set(id, loading);
  }
  return loading;
}

/** Shows the draft, starting one unless there is one (it stays empty until sent). */
export function openDraft(): void {
  if (draftId && chats.has(draftId)) return;
  const chat = createChat();
  draftId = chat.id;
  chats.set(chat.id, chat);
  notify();
}

/**
 * Deletes a chat for good, after stopping its answer. It is dropped without
 * notifying: the caller moves off it, so the chat on screen doesn't flash
 * into loading it again first.
 */
export async function deleteChat(id: string): Promise<void> {
  const chat = chats.get(id);
  await chat?.stop();
  await http.delete(`/ai/conversations/${id}`);
  if (chats.get(id) === chat) chats.delete(id);
  refreshList();
}

/** Signed out: stop every answer and forget the chats (they stay saved on the server). */
export function resetChats(): void {
  session += 1;
  loads.clear();
  for (const chat of chats.values()) void chat.stop();
  chats.clear();
  draftId = undefined;
  notify();
}

/**
 * Puts a form's recorded output (with its `outcome`) into its chat, as the
 * server now has it, so the form turns into its result without a reload.
 * Messages without that call keep their identity. A chat no longer in memory
 * loads with it.
 */
export function patchFormOutput(conversationId: string, toolCallId: string, output: FormToolOutput): void {
  const chat = chats.get(conversationId);
  if (!chat) return;
  const isTarget = (part: GenUIMessage['parts'][number]) =>
    isFormToolPart(part) && part.toolCallId === toolCallId && part.state === 'output-available';
  chat.messages = chat.messages.map((message) =>
    message.parts.some(isTarget)
      ? {
          ...message,
          parts: message.parts.map((part) =>
            isTarget(part) ? ({ ...part, output } as GenUIMessage['parts'][number]) : part,
          ),
        }
      : message,
  );
}

/** The chat `id`, or the draft without one; `undefined` until `openChat`/`openDraft` has it. */
export function useChatEntry(id: string | undefined): Chat<GenUIMessage> | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => {
      const shown = id ?? draftId;
      return shown === undefined ? undefined : chats.get(shown);
    },
  );
}
