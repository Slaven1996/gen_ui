import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage, getErrorStatus } from '@/lib/api/errors';
import { openChat, openDraft, useChatEntry } from '../store/chat-store';
import { ChatThreadView } from './chat-thread-view';

/**
 * The chat `chatId`, restored from the server the first time it is shown;
 * without one, a new chat, which gets its id in the URL with its first message.
 */
export function ChatThread({ chatId }: { chatId?: string }) {
  const chat = useChatEntry(chatId);
  const navigate = useNavigate();
  // A failed load, for the chat it was for: switching to another chat drops it.
  const [failure, setFailure] = useState<{ chatId: string; error: unknown } | null>(null);
  const loadError = failure && failure.chatId === chatId ? failure.error : null;

  useEffect(() => {
    if (!chatId) {
      openDraft();
      return;
    }
    let current = true;
    openChat(chatId).catch((error: unknown) => {
      if (current) setFailure({ chatId, error });
    });
    return () => {
      current = false;
    };
  }, [chatId, chat]);

  const retry = () => {
    if (!chatId) return;
    setFailure(null);
    openChat(chatId).catch((error: unknown) => setFailure({ chatId, error }));
  };

  if (!chat) {
    const missing = getErrorStatus(loadError) === 404;
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        {loadError ? (
          <div className="space-y-2 text-sm" role="alert">
            <p className={missing ? 'text-muted-foreground' : 'text-destructive'}>
              {missing
                ? "This chat doesn't exist, or it was deleted."
                : getErrorMessage(loadError, 'The conversation could not be loaded.')}
            </p>
            {missing ? (
              <Button size="sm" variant="outline" asChild>
                <Link to="/assistant" search={{}}>
                  New chat
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={retry}>
                Try again
              </Button>
            )}
          </div>
        ) : (
          <>
            <Skeleton className="h-10 w-2/3 self-end" />
            <Skeleton className="h-24" />
          </>
        )}
      </div>
    );
  }

  // A new chat's first message gives it its URL; the same chat stays on screen.
  const onSent = chatId
    ? undefined
    : () => void navigate({ to: '/assistant', search: { chat: chat.id }, replace: true });

  // Remount when the chat changes (another one, another user) so the hook binds to it.
  return <ChatThreadView key={chat.id} chat={chat} onSent={onSent} />;
}
