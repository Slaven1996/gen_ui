/**
 * The access token lives only in this module's memory — never in
 * localStorage/sessionStorage/cookies — so an XSS payload can't lift it from
 * storage and it disappears when the tab closes. The long-lived credential is
 * the httpOnly refresh cookie, which JavaScript can't read at all.
 */
let accessToken: string | null = null;
let expiresAt = 0;

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },

  /** @param expiresAtMs absolute expiry (epoch ms) */
  set(token: string, expiresAtMs: number): void {
    accessToken = token;
    expiresAt = expiresAtMs;
  },

  clear(): void {
    accessToken = null;
    expiresAt = 0;
  },

  /** True when a token exists and stays valid for at least `marginMs` more. */
  isFresh(marginMs = 0): boolean {
    return accessToken !== null && expiresAt - Date.now() > marginMs;
  },
};
