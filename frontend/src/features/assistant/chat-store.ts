import { useSyncExternalStore } from 'react';
import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { GenUIMessage } from '@gen-ui/shared';
import { API_BASE_URL } from '@/lib/api/config';
import { authStore } from '@/lib/auth/auth-store';
import { refreshSession } from '@/lib/auth/refresh';
import { tokenStore } from '@/lib/auth/token-store';
import { getAssistantContext } from './assistant-context';

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

function createChat(): Chat<GenUIMessage> {
  return new Chat<GenUIMessage>({
    transport: new DefaultChatTransport<GenUIMessage>({
      api: `${API_BASE_URL}/ai/chat`,
      fetch: authFetch,
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { id, messages, context: getAssistantContext() },
      }),
    }),
  });
}

/*
 * One conversation shared by the side panel and the /assistant page, so the
 * thread survives navigation. Replaced on sign-out so users never see each
 * other's history.
 */
let chat = createChat();
const listeners = new Set<() => void>();

export function getChat(): Chat<GenUIMessage> {
  return chat;
}

export function resetChat(): void {
  void chat.stop();
  chat = createChat();
  listeners.forEach((listener) => listener());
}

export function useChatInstance(): Chat<GenUIMessage> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => chat,
  );
}
