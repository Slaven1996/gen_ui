import { lazy, Suspense } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AuthStore } from '@/lib/auth/auth-store';

export interface RouterContext {
  auth: AuthStore;
  queryClient: QueryClient;
}

// Opt-in (VITE_DEVTOOLS=true) so the floating buttons don't cover the UI by default.
const Devtools =
  import.meta.env.DEV && import.meta.env.VITE_DEVTOOLS === 'true'
    ? lazy(() => import('@/components/devtools'))
    : () => null;

export const Route = createRootRouteWithContext<RouterContext>()({
  // Hold every route until the boot-time silent refresh has settled, so
  // guards never see the transient "unknown" state.
  beforeLoad: async ({ context }) => {
    await context.auth.ready;
  },
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <TooltipProvider delayDuration={0}>
      <Outlet />
      <Toaster position="top-center" />
      <Suspense>
        <Devtools />
      </Suspense>
    </TooltipProvider>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The link may be broken, or the page may have moved.</p>
      <Button asChild variant="outline">
        <Link to="/">Go to the dashboard</Link>
      </Button>
    </div>
  );
}
