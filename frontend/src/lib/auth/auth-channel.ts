import type { AuthResponse } from '@gen-ui/shared';
import { authStore } from './auth-store';

/**
 * Keeps tabs in sync. After one tab logs in or refreshes, the others adopt its
 * access token instead of rotating the refresh cookie themselves (which would
 * look like token reuse to the server); logging out in one tab logs out all.
 * Same-origin only, so sharing the token here exposes nothing new.
 */
type AuthMessage =
  | { type: 'session'; session: AuthResponse; expiresAt: number }
  | { type: 'logout' };

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('gen-ui-auth');

export function broadcastSession(session: AuthResponse, expiresAt: number): void {
  channel?.postMessage({ type: 'session', session, expiresAt } satisfies AuthMessage);
}

export function broadcastLogout(): void {
  channel?.postMessage({ type: 'logout' } satisfies AuthMessage);
}

let listening = false;

export function listenForAuthMessages(): void {
  if (!channel || listening) return;
  listening = true;
  channel.addEventListener('message', (event: MessageEvent<AuthMessage>) => {
    const message = event.data;
    if (message.type === 'session') {
      authStore.applySession(message.session, message.expiresAt);
    } else if (message.type === 'logout') {
      authStore.clearSession();
    }
  });
}
