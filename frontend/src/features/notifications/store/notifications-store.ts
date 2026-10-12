import { useEffect, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  NOTIFICATIONS_NAMESPACE,
  SOCKET_IO_PATH,
  type AppNotification,
  type NotificationList,
  type NotificationServerEvents,
} from '@gen-ui/shared';
import { API_BASE_URL } from '@/lib/api/config';
import { queryClient } from '@/lib/api/query-client';
import { refreshSession } from '@/lib/auth/refresh';
import { tokenStore } from '@/lib/auth/token-store';
import { notificationKeys } from '../api/queries';

/*
 * Real-time notifications: one WebSocket per signed-in tab, opened by the app
 * shell. The inbox itself is stored on the server and cached by TanStack Query
 * (`notificationsQueryOptions`); the socket only keeps that cache current. Each
 * pushed notification is added to it the moment it arrives, and every
 * (re)connect refetches it, for whatever came while the socket was down.
 * Nothing here polls.
 */

/** A refused socket (e.g. the account was deactivated) tries again this much later. */
const RETRY_REFUSED_MS = 15_000;

let connected = false;
const listeners = new Set<() => void>();

function setConnected(next: boolean): void {
  if (connected === next) return;
  connected = next;
  listeners.forEach((listener) => listener());
}

/** The inbox with `notification` on top; unchanged when it is already there or the inbox isn't loaded. */
function withArrival(inbox: NotificationList | undefined, notification: AppNotification): NotificationList | undefined {
  if (!inbox || inbox.items.some((item) => item.id === notification.id)) return inbox;
  return {
    ...inbox,
    items: [notification, ...inbox.items].slice(0, inbox.pageSize),
    total: inbox.total + 1,
    unread: inbox.unread + 1,
  };
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

  next.on('connect', () => {
    setConnected(true);
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  });
  next.on('disconnect', () => setConnected(false));
  next.on('connect_error', () => {
    setConnected(false);
    // `active`: a network problem, and Socket.IO retries by itself. Otherwise
    // the server refused the token, and Socket.IO leaves retrying to us.
    if (!next.active) retryTimer = window.setTimeout(() => next.connect(), RETRY_REFUSED_MS);
  });
  next.on('notification', (notification) => {
    queryClient.setQueryData<NotificationList>(notificationKeys.inbox, (inbox) => withArrival(inbox, notification));
  });
  socket = next;
}

function disconnect(): void {
  window.clearTimeout(retryTimer);
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = undefined;
  setConnected(false);
}

/** Keeps the socket open while the signed-in app shell is mounted. */
export function useNotificationsSocket(): void {
  useEffect(() => {
    connect();
    return disconnect;
  }, []);
}

/** Signed out: close the socket. The inbox goes with the rest of the query cache. */
export function resetNotifications(): void {
  disconnect();
}

/** Is the socket up? The bell says "Live" or "Connecting…". */
export function useNotificationsConnected(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => connected,
  );
}
