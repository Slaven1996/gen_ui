/** Relative by default so the SPA and API share an origin (Vite proxy in dev, reverse proxy in prod). */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
