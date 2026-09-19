import { AUTH_ERROR_CODES, type AuthResponse } from '@gen-ui/shared';
import { API_BASE_URL } from '../api/config';
import { broadcastSession } from './auth-channel';
import { authStore } from './auth-store';
import { tokenStore } from './token-store';

export type RefreshResult = 'refreshed' | 'unauthenticated';

let inFlight: Promise<RefreshResult> | null = null;

/**
 * Exchange the httpOnly refresh cookie for a new access token.
 *
 * - Single-flight: concurrent callers in this tab share one request.
 * - Cross-tab: a Web Lock serialises refreshes between tabs; a tab that waited
 *   reuses the token the winner broadcast instead of rotating again.
 *
 * Resolves `'unauthenticated'` when the session is gone; throws on network or
 * server errors (so a flaky connection never logs anyone out).
 */
export function refreshSession(): Promise<RefreshResult> {
  if (!inFlight) {
    const tokenBefore = tokenStore.get();
    inFlight = withRefreshLock(() => runRefresh(tokenBefore)).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('gen-ui-auth-refresh', task);
  }
  return task();
}

async function runRefresh(tokenBefore: string | null, attempt = 0): Promise<RefreshResult> {
  // Another tab refreshed while we waited for the lock and shared its token.
  if (tokenStore.get() !== tokenBefore && tokenStore.isFresh(30_000)) return 'refreshed';

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (response.ok) {
    const session = (await response.json()) as AuthResponse;
    const expiresAt = Date.now() + session.expiresIn * 1000;
    authStore.applySession(session, expiresAt);
    broadcastSession(session, expiresAt);
    return 'refreshed';
  }

  if (response.status === 401) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    // Lost a rotation race (e.g. no Web Locks support): the cookie jar already
    // holds the winner's new cookie, so one retry succeeds.
    if (body?.code === AUTH_ERROR_CODES.REFRESH_RACE && attempt === 0) {
      return runRefresh(tokenBefore, attempt + 1);
    }
    return 'unauthenticated';
  }

  throw new Error(`Session refresh failed (${response.status})`);
}
