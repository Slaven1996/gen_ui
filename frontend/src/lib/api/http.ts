import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { authStore } from '../auth/auth-store';
import { refreshSession } from '../auth/refresh';
import { tokenStore } from '../auth/token-store';
import { serializeQuery } from '../search';
import { API_BASE_URL } from './config';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Don't try to refresh + retry on 401 (auth endpoints themselves). */
    skipAuthRefresh?: boolean;
  }
  interface InternalAxiosRequestConfig {
    _retried?: boolean;
  }
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  // Only matters for split-origin deployments; same-origin requests send cookies anyway.
  withCredentials: true,
  // `state=ACTIVE,CLEARED` rather than axios' default `state[]=…`, matching the API and the URLs.
  paramsSerializer: { serialize: (params) => serializeQuery(params) },
});

http.interceptors.request.use(async (config) => {
  // Refresh proactively when the token is about to expire, saving a 401 round-trip.
  if (!config.skipAuthRefresh && authStore.isAuthenticated() && !tokenStore.isFresh(5_000)) {
    await refreshSession().catch(() => undefined);
  }
  const token = tokenStore.get();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

http.interceptors.response.use(undefined, async (error: unknown) => {
  if (!(error instanceof AxiosError)) throw error;

  const config = error.config as InternalAxiosRequestConfig | undefined;
  if (error.response?.status !== 401 || !config || config._retried || config.skipAuthRefresh) {
    throw error;
  }

  config._retried = true;
  const result = await refreshSession();
  if (result === 'unauthenticated') {
    // The shared cookie is gone for every tab, so no broadcast is needed.
    authStore.clearSession();
    throw error;
  }
  return http(config);
});
