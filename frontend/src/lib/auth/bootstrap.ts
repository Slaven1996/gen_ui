import { listenForAuthMessages } from './auth-channel';
import { authStore } from './auth-store';
import { refreshSession } from './refresh';

let started = false;

/**
 * On page load the in-memory token is gone, so try a silent refresh with the
 * httpOnly cookie. Runs once; the router waits on `authStore.ready`.
 */
export function bootstrapAuth(): void {
  if (started) return;
  started = true;

  listenForAuthMessages();
  refreshSession()
    .then((result) => {
      if (result === 'unauthenticated') authStore.clearSession();
    })
    .catch(() => authStore.clearSession());
}
