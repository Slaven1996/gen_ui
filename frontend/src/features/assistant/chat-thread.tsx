import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useChat, type Chat } from '@ai-sdk/react';
import { ArrowUp, Square } from 'lucide-react';
import type { GenUIMessage } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/auth-store';
import { cn } from '@/lib/utils';
import { ChatMessage } from './chat-message';
import { useChatInstance } from './chat-store';

const BASE_SUGGESTIONS = [
  'Show these as stat cards: 1,284 active users (+3.2%), $48.2k revenue (+12%), 2.1% churn (−0.4%)',
  'Chart monthly signups as bars: Jan 120, Feb 180, Mar 240, Apr 210, May 300, Jun 340',
];
const ADMIN_SUGGESTIONS = ['List all admin accounts'];

export function ChatThread({ className }: { className?: string }) {
  const chat = useChatInstance();
  // Remount on reset so the hook binds to the new conversation.
  return <ChatThreadView key={chat.id} chat={chat} className={className} />;
}

function ChatThreadView({ chat, className }: { chat: Chat<GenUIMessage>; className?: string }) {
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({ chat });
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput('');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(input);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(input);
    }
  };

  const suggestions = user?.role === 'ADMIN' ? [...BASE_SUGGESTIONS, ...ADMIN_SUGGESTIONS] : BASE_SUGGESTIONS;

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground">
              Ask about your data. Answers can include live cards, charts and tables.
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <ChatMessage key={message.id} message={message} />)
        )}

        {status === 'submitted' && <p className="text-xs text-muted-foreground">Thinking…</p>}

        {error && (
          <div className="space-y-2 rounded-md border border-destructive/40 px-3 py-2 text-sm" role="alert">
            <p className="text-destructive">{describeChatError(error)}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearError();
                void regenerate();
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask the assistant…"
            aria-label="Message the assistant"
            rows={1}
            className="max-h-40 min-h-10 resize-none"
          />
          {busy ? (
            <Button type="button" size="icon" variant="outline" onClick={() => void stop()} aria-label="Stop generating">
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send message">
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/** The transport surfaces the raw response body; pull out the API's message when there is one. */
function describeChatError(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('. ');
    if (body.message) return body.message;
  } catch {
    // Not JSON — fall through.
  }
  return error.message || 'The assistant is unavailable right now.';
}
