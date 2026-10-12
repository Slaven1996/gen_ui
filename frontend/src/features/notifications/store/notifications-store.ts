import { useEffect, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  NOTIFICATIONS_NAMESPACE,
  SOCKET_IO_PATH,
  type AppNotification,
  type NotificationServerEvents,
} from '@gen-ui/shared';
import { API_BASE_URL } from '@/lib/api/config';
import { refreshSession } from '@/lib/auth/refresh';
import { tokenStore } from '@/lib/auth/token-store';

/*
 * Real-time notifications: one WebSocket per signed-in tab, opened by the app
 * shell. The server pushes each notification the moment it happens; nothing
 * here polls. The list lives in memory, per tab, and is forgotten on sign-out.
 */

/** The bell keeps this many, newest first. */
const KEEP = 50;
/** A refused socket (e.g. the account was deactivated) tries again this much later. */
const RETRY_REFUSED_MS = 15_000;

export interface NotificationsState {
  /** Newest first. */
  items: AppNotification[];
  /** How many of the first `items` arrived since the list was last looked at. */
  unread: number;
  connected: boolean;
}

let state: NotificationsState = { items: [], unread: 0, connected: false };
const listeners = new Set<() => void>();

function update(patch: Partial<NotificationsState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

let socket: Socket<NotificationServerEvents> | undefined;
let retryTimer: number | undefined;

/** A token good for a few more seconds: refreshed first when it is about to expire. */
async function freshToken(): Promise<string | null> {
  if (!tokenStore.isFresh(5_000)) await refreshSession().catch(() => undefined);
  return tokenStore.get();
}

function connect(): void {
  if (socket) return;
  // The API's origin: this one in dev (Vite proxy) and Docker (nginx), another with VITE_API_BASE_URL.
  const { origin } = new URL(API_BASE_URL, window.location.origin);
  const next: Socket<NotificationServerEvents> = io(`${origin}${NOTIFICATIONS_NAMESPACE}`, {
    path: SOCKET_IO_PATH,
    transports: ['websocket'],
    // Called on every (re)connect, so a reconnect an hour later sends a current token.
    auth: (send) => {
      void freshToken().then((token) => send({ token }));
    },
  });

  next.on('connect', () => update({ connected: true }));
  next.on('disconnect', () => update({ connected: false }));
  next.on('connect_error', () => {
    update({ connected: false });
    // `active`: a network problem, and Socket.IO retries by itself. Otherwise
    // the server refused the token, and Socket.IO leaves retrying to us.
    if (!next.active) retryTimer = window.setTimeout(() => next.connect(), RETRY_REFUSED_MS);
  });
  next.on('notification', (notification) => {
    update({ items: [notification, ...state.items].slice(0, KEEP), unread: Math.min(state.unread + 1, KEEP) });
  });
  socket = next;
}

function disconnect(): void {
  window.clearTimeout(retryTimer);
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = undefined;
  update({ connected: false });
}

/** Keeps the socket open while the signed-in app shell is mounted. */
export function useNotificationsSocket(): void {
  useEffect(() => {
    connect();
    return disconnect;
  }, []);
}

/** Signed out: close the socket and forget this user's notifications. */
export function resetNotifications(): void {
  disconnect();
  update({ items: [], unread: 0 });
}

export function markNotificationsRead(): void {
  if (state.unread > 0) update({ unread: 0 });
}

export function clearNotifications(): void {
  update({ items: [], unread: 0 });
}

export function useNotifications(): NotificationsState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
