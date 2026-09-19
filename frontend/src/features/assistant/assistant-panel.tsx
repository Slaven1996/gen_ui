import { Link, useRouterState } from '@tanstack/react-router';
import { Maximize2, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { setAssistantOpen, useAssistantOpen } from './assistant-panel-state';
import { ChatThread } from './chat-thread';
import { resetChat } from './chat-store';

/** Right-hand assistant, available on every signed-in page (hidden on /assistant itself). */
export function AssistantPanel() {
  const open = useAssistantOpen();
  const isMobile = useIsMobile();
  const onAssistantPage = useRouterState({ select: (state) => state.location.pathname === '/assistant' });

  if (onAssistantPage) return null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setAssistantOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md [&>button:last-child]:hidden">
          <SheetTitle className="sr-only">Assistant</SheetTitle>
          <SheetDescription className="sr-only">Chat with the AI assistant</SheetDescription>
          <PanelBody />
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <aside
      aria-label="Assistant"
      className="sticky top-0 flex h-svh w-[400px] shrink-0 flex-col border-l bg-background xl:w-[440px]"
    >
      <PanelBody />
    </aside>
  );
}

function PanelBody() {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
        <h2 className="mr-auto text-sm font-medium">Assistant</h2>
        <Button variant="ghost" size="icon" className="size-8" onClick={resetChat} aria-label="New conversation">
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link to="/assistant" aria-label="Open full page">
            <Maximize2 />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setAssistantOpen(false)}
          aria-label="Close assistant"
        >
          <X />
        </Button>
      </div>
      <ChatThread className="flex-1" />
    </>
  );
}
