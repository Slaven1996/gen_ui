import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SiteHeader, useAssistantShortcut } from '@/components/layout/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AssistantPanel } from '@/features/assistant/assistant-panel';

/** Pathless layout: everything under it requires a session and gets the app shell. */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isAuthenticated()) return;
    // Signing out forgets where you were: the next sign-in starts at the
    // dashboard. A session that ended on its own still comes back here.
    const signedOut = context.auth.lastSignOutReason() === 'signed-out';
    throw redirect({ to: '/login', search: signedOut ? {} : { redirect: location.href } });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useAssistantShortcut();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <SiteHeader />
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
      <AssistantPanel />
    </SidebarProvider>
  );
}
