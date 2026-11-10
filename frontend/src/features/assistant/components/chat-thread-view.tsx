import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useChat, type Chat } from '@ai-sdk/react';
import { ArrowUp, Square, Trash2 } from 'lucide-react';
import type { GenUIMessage } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useChatActions } from '../hooks/use-chat-actions';
import { describeChatError } from '../lib/chat-errors';
import { isVisiblePart } from '../lib/visible-parts';
import { setGenerateUi, useGenerateUi } from '../store/assistant-preferences';
import { ChatMessage } from './chat-message';
import { ModelSettings } from './model-settings';

/** A chat on screen. `onSent`: called after a message is sent (a new chat then takes its URL). */
export function ChatThreadView({ chat, onSent }: { chat: Chat<GenUIMessage>; onSent?: () => void }) {
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({ chat });
  const generateUi = useGenerateUi();
  const toggleId = useId();
  const [input, setInput] = useState('');
  const { actions, dialogs } = useChatActions(chat.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  // Until the answer shows something: also while Claude only looks things up for itself.
  const last = messages.at(-1);
  const thinking =
    status === 'submitted' ||
    (status === 'streaming' && !(last?.role === 'assistant' && last.parts.some(isVisiblePart)));

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput('');
    onSent?.();
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <p className="pt-6 text-sm text-muted-foreground">
            Ask about the data in this app. Answers can include live tables.
          </p>
        ) : (
          messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              conversationId={chat.id}
              message={message}
              streaming={busy && index === messages.length - 1}
            />
          ))
        )}

        {thinking && <p className="text-xs text-muted-foreground">Thinking…</p>}

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

      <div className="space-y-2 border-t p-3">
        <ModelSettings />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch id={toggleId} checked={generateUi} onCheckedChange={setGenerateUi} />
            <Label htmlFor={toggleId} className="text-xs font-normal">
              Generate UI components
            </Label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={busy || messages.length === 0}
            onClick={() => actions.onDelete(chat.id)}
          >
            <Trash2 />
            Delete chat
          </Button>
        </div>

        <form onSubmit={onSubmit} className="flex items-end gap-2">
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
        </form>
      </div>

      {dialogs}
    </div>
  );
}
