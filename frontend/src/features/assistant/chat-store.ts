import { useSyncExternalStore } from 'react';
import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { GenUIMessage, LatestConversation } from '@gen-ui/shared';
import { API_BASE_URL } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { authStore } from '@/lib/auth/auth-store';
import { refreshSession } from '@/lib/auth/refresh';
import { tokenStore } from '@/lib/auth/token-store';
import { browserTimeZone } from '@/lib/search';
import { getAssistantEffort, getAssistantModel, getGenerateUi } from './assistant-preferences';

/*
 * The browser side of the chat. Nothing here is AI-driven: it restores the
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

function createChat(conversationId = newConversationId(), saved: GenUIMessage[] = []): Chat<GenUIMessage> {
  return new Chat<GenUIMessage>({
    id: conversationId,
    messages: saved,
    transport: new DefaultChatTransport<GenUIMessage>({
      api: `${API_BASE_URL}/ai/chat`,
      fetch: authFetch,
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
  });
}

/*
 * One saved conversation per user, shared by the side panel and the
 * /assistant page. It is loaded the first time either opens, and forgotten on
 * sign-out so the next user loads their own.
 */
let chat: Chat<GenUIMessage> | undefined;
let loading: Promise<void> | undefined;
/** Bumped on sign-out, so a load that was still running can't install the old user's chat. */
let session = 0;
const listeners = new Set<() => void>();

function setChat(next: Chat<GenUIMessage> | undefined): void {
  chat = next;
  listeners.forEach((listener) => listener());
}

/** Restores the saved conversation, or starts a new one. Safe to call repeatedly. */
export function loadChat(): Promise<void> {
  if (chat) return Promise.resolve();
  if (!loading) {
    const started = session;
    loading = http
      .get<LatestConversation>('/ai/conversations/latest')
      .then(({ data }) => {
        if (started !== session) return;
        const saved = data.conversation;
        setChat(saved ? createChat(saved.id, saved.messages) : createChat());
      })
      .finally(() => {
        if (started === session) loading = undefined;
      });
  }
  return loading;
}

/** Deletes the saved conversation for good and starts an empty one. */
export async function clearChat(): Promise<void> {
  const current = chat;
  if (!current) return;
  await current.stop();
  await http.delete(`/ai/conversations/${current.id}`);
  if (chat === current) setChat(createChat());
}

/** Signed out: stop any answer and forget the conversation (it stays saved on the server). */
export function resetChat(): void {
  session += 1;
  loading = undefined;
  void chat?.stop();
  setChat(undefined);
}

/** The current conversation, or `undefined` until `loadChat` has restored it. */
export function useChatInstance(): Chat<GenUIMessage> | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => chat,
  );
}
