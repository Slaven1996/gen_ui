export const API_PREFIX = 'api';

/** The refresh cookie is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

/**
 * Swagger UI, served outside `${API_PREFIX}` so it sits next to the web app
 * instead of inside the API surface. nginx and the Vite dev server both
 * forward this path here, which puts the docs on the web app's own origin.
 */
export const DOCS_PATH = 'docs';
