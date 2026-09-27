import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { toggleAssistant, useAssistantOpen } from '@/features/assistant/assistant-preferences';

export function SiteHeader() {
  const assistantOpen = useAssistantOpen();
  const title = useRouterState({
    select: (state) => [...state.matches].reverse().find((match) => match.staticData.title)?.staticData.title,
  });
  const onAssistantPage = useRouterState({ select: (state) => state.location.pathname === '/assistant' });

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <h1 className="truncate text-sm font-medium">{title}</h1>
      {!onAssistantPage && (
        <Button
          variant={assistantOpen ? 'secondary' : 'outline'}
          size="sm"
          className="ml-auto"
          onClick={toggleAssistant}
          aria-pressed={assistantOpen}
        >
          <Sparkles />
          Assistant
          <kbd className="ml-1 hidden rounded border px-1 font-sans text-[10px] text-muted-foreground sm:inline">
            Ctrl J
          </kbd>
        </Button>
      )}
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
