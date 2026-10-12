import { createRouter } from '@tanstack/react-router';
import { FullPageSpinner } from './components/layout/full-page-spinner';
import { RouteError } from './components/layout/route-error';
import { queryClient } from './lib/api/query-client';
import { authStore } from './lib/auth/auth-store';
import { parseSearch, stringifySearch } from './lib/search';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  context: { auth: authStore, queryClient },
  defaultPreload: 'intent',
  // TanStack Query owns caching; the router always asks it.
  defaultPreloadStaleTime: 0,
  defaultPendingComponent: FullPageSpinner,
  defaultErrorComponent: RouteError,
  scrollRestoration: true,
  // Arrays in the URL as `a,b` — the same form the API reads.
  parseSearch,
  stringifySearch,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    /** Shown in the app header. */
    title?: string;
  }
}
