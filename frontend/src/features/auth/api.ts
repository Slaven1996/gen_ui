import type { AuthResponse, LoginRequest } from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { queryClient } from '@/lib/api/query-client';
import { broadcastLogout, broadcastSession } from '@/lib/auth/auth-channel';
import { authStore } from '@/lib/auth/auth-store';

export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  const { data } = await http.post<AuthResponse>('/auth/login', credentials, { skipAuthRefresh: true });
  // Guarantee a previous user's cached data can never render for this one.
  // Safe here: only /login is mounted, so nothing refetches.
  queryClient.clear();
  const expiresAt = Date.now() + data.expiresIn * 1000;
  authStore.applySession(data, expiresAt);
  broadcastSession(data, expiresAt);
  return data;
}

/** Revokes the refresh token family server-side, then signs out every tab. */
export async function logout(): Promise<void> {
  try {
    await http.post('/auth/logout', undefined, { skipAuthRefresh: true });
  } finally {
    authStore.clearSession();
    broadcastLogout();
  }
}
