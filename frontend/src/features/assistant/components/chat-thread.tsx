import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api/errors';
import { loadChat, useChatInstance } from '../store/chat-store';
import { ChatThreadView } from './chat-thread-view';

/** The conversation, restored from the server the first time it is shown. */
export function ChatThread() {
  const chat = useChatInstance();
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    if (!chat) loadChat().catch(setLoadError);
  }, [chat]);

  const retry = () => {
    setLoadError(null);
    loadChat().catch(setLoadError);
  };

  if (!chat) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        {loadError ? (
          <div className="space-y-2 text-sm" role="alert">
            <p className="text-destructive">{getErrorMessage(loadError, 'The conversation could not be loaded.')}</p>
            <Button size="sm" variant="outline" onClick={retry}>
              Try again
            </Button>
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

  // Remount when the conversation changes (cleared, another user) so the hook binds to it.
  return <ChatThreadView key={chat.id} chat={chat} />;
}
