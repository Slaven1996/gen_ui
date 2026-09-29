import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { toggleAssistant, useAssistantOpen } from '@/features/assistant/assistant-preferences';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { UserMenu } from './user-menu';

/**
 * The top bar: page title on the left; assistant, notifications and the
 * account menu on the right. `sticky top-0` keeps it in view however far a
 * long page (a big table) scrolls: the window scrolls, and no ancestor clips
 * or scrolls on its own. The solid background and z-index keep scrolled
 * content from showing through or on top.
 */
export function SiteHeader() {
  const assistantOpen = useAssistantOpen();
  const title = useRouterState({
    select: (state) => [...state.matches].reverse().find((match) => match.staticData.title)?.staticData.title,
  });
  const onAssistantPage = useRouterState({ select: (state) => state.location.pathname === '/assistant' });

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>

      <div className="ml-auto flex items-center gap-1">
        {!onAssistantPage && (
          <Button
            variant={assistantOpen ? 'secondary' : 'outline'}
            size="sm"
            className="mr-1"
            onClick={toggleAssistant}
            aria-pressed={assistantOpen}
            aria-label="Assistant"
          >
            <Sparkles />
            <span className="hidden sm:inline">Assistant</span>
            <kbd className="ml-1 hidden rounded border px-1 font-sans text-[10px] text-muted-foreground sm:inline">
              Ctrl J
            </kbd>
          </Button>
        )}
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

/** Ctrl/Cmd + J toggles the assistant panel. */
export function useAssistantShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'j' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggleAssistant();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
