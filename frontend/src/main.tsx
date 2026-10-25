import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from 'next-themes';
import './index.css';
import { resetChats } from './features/assistant/store/chat-store';
import { resetNotifications } from './features/notifications/store/notifications-store';
import { queryClient } from './lib/api/query-client';
import { authStore } from './lib/auth/auth-store';
import { bootstrapAuth } from './lib/auth/bootstrap';
import { router } from './router';

bootstrapAuth();

// Signed out (explicitly, by expiry, or from another tab): drop all user-scoped state.
authStore.onSignedOut(() => {
  resetChats();
  resetNotifications();
  // Clear the cache once the router has left the protected page — clearing while
  // its queries are still mounted would make them refetch without a token.
  // (login() clears it again, so nothing can leak to the next user regardless.)
  const unsubscribe = router.subscribe('onResolved', () => {
    unsubscribe();
    if (!authStore.isAuthenticated()) queryClient.clear();
  });
});

// Re-run route guards whenever the session status changes: a login leaves
// /login, an expiry or remote logout lands on /login?redirect=….
let lastStatus = authStore.getSnapshot().status;
authStore.subscribe(() => {
  const { status } = authStore.getSnapshot();
  if (status === lastStatus) return;
  lastStatus = status;
  void router.invalidate();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Light, dark or follow the OS: toggles the `.dark` class on <html> (tokens in index.css) and remembers the choice in localStorage. */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
