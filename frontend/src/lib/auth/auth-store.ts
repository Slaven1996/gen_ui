import { useSyncExternalStore } from 'react';
import type { AuthResponse, PublicUser } from '@gen-ui/shared';
import { tokenStore } from './token-store';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/** Why a session ended: one is the user's own doing, the other happens to them. */
export type SignOutReason = 'signed-out' | 'expired';

export interface AuthSnapshot {
  status: AuthStatus;
  user: PublicUser | null;
}

type Listener = () => void;

let snapshot: AuthSnapshot = { status: 'unknown', user: null };
let signOutReason: SignOutReason = 'expired';
const listeners = new Set<Listener>();
const signedOutListeners = new Set<Listener>();

let markReady!: () => void;
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

function emit(next: AuthSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/**
 * Session state for the SPA. Passed to the router as context so route guards
 * read the *current* state, and exposed to React via `useAuth()`.
 */
export const authStore = {
  getSnapshot: (): AuthSnapshot => snapshot,

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Resolves once the boot-time session check has finished (either way). */
  ready,

  isAuthenticated: (): boolean => snapshot.status === 'authenticated',

  /** Apply a login/refresh result (or one received from another tab). */
  applySession(session: AuthResponse, expiresAtMs = Date.now() + session.expiresIn * 1000): void {
    tokenStore.set(session.accessToken, expiresAtMs);
    signOutReason = 'expired';
    emit({ status: 'authenticated', user: session.user });
    markReady();
  },

  /**
   * Replace the cached user after they edit their own profile. Leaves the
   * access token alone — nothing about it changed.
   */
  setUser(user: PublicUser): void {
    if (snapshot.status !== 'authenticated') return;
    emit({ status: 'authenticated', user });
  },

  /** Drop the in-memory session. Fires `onSignedOut` listeners if a user was signed in. */
  clearSession(reason: SignOutReason = 'expired'): void {
    const wasAuthenticated = snapshot.status === 'authenticated';
    signOutReason = reason;
    tokenStore.clear();
    emit({ status: 'anonymous', user: null });
    markReady();
    if (wasAuthenticated) signedOutListeners.forEach((listener) => listener());
  },

  /**
   * How the last session ended, so the sign-in screen knows whether to come
   * back to the page the user was on. Reset by the next `applySession`.
   */
  lastSignOutReason: (): SignOutReason => signOutReason,

  /** App-level cleanup hook (cache, chat, navigation) — registered once in main.tsx. */
  onSignedOut(listener: Listener): () => void {
    signedOutListeners.add(listener);
    return () => signedOutListeners.delete(listener);
  },
};

export type AuthStore = typeof authStore;

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
}
