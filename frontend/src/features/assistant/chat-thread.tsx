import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useChat, type Chat } from '@ai-sdk/react';
import { ArrowUp, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ASSISTANT_MODELS,
  AssistantModelSchema,
  EffortSchema,
  type Effort,
  type GenUIMessage,
} from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import {
  setAssistantEffort,
  setAssistantModel,
  setGenerateUi,
  useAssistantEffort,
  useAssistantModel,
  useGenerateUi,
} from './assistant-preferences';
import { ChatMessage } from './chat-message';
import { clearChat, loadChat, useChatInstance } from './chat-store';

/** The conversation, restored from the server the first time it is shown. */
export function ChatThread({ className }: { className?: string }) {
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
      <div className={cn('flex h-full min-h-0 flex-col gap-3 p-4', className)}>
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
  return <ChatThreadView key={chat.id} chat={chat} className={className} />;
}

function ChatThreadView({ chat, className }: { chat: Chat<GenUIMessage>; className?: string }) {
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({ chat });
  const generateUi = useGenerateUi();
  const toggleId = useId();
  const [input, setInput] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    console.log('MESSAGES');
    console.log(messages);
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

  const onClear = () => {
    setClearing(true);
    // On success the thread remounts on the new, empty conversation.
    clearChat().catch((failure: unknown) => {
      toast.error(getErrorMessage(failure));
      setClearing(false);
    });
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <p className="pt-6 text-sm text-muted-foreground">
            Ask about the data in this app. Answers can include live tables.
          </p>
        ) : (
          messages.map((message, index) => (
            <ChatMessage key={message.id} message={message} streaming={busy && index === messages.length - 1} />
          ))
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
            onClick={() => setConfirmingClear(true)}
          >
            <Trash2 />
            Clear chat
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

      <ConfirmDialog
        open={confirmingClear}
        onOpenChange={setConfirmingClear}
        title="Clear this chat?"
        description="The whole conversation is deleted for good, on every device."
        confirmLabel="Clear chat"
        pending={clearing}
        onConfirm={onClear}
      />
    </div>
  );
}

const EFFORT_LABELS: Record<Effort, string> = {
  low: 'Low effort',
  medium: 'Medium effort',
  high: 'High effort',
  xhigh: 'Extra-high effort',
  max: 'Max effort',
};

/**
 * Which Claude model answers the next message, and how hard it works. Both
 * are remembered in this browser and sent with every request. The effort
 * picker is hidden for a model without effort levels (Claude Haiku 4.5).
 */
function ModelSettings() {
  const model = useAssistantModel();
  const effort = useAssistantEffort();
  const { effort: hasEffort } = ASSISTANT_MODELS[model];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={model} onValueChange={(value) => setAssistantModel(AssistantModelSchema.parse(value))}>
        <SelectTrigger size="sm" className="text-xs" aria-label="Model">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AssistantModelSchema.options.map((id) => (
            <SelectItem key={id} value={id} className="text-xs">
              {ASSISTANT_MODELS[id].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasEffort ? (
        <Select value={effort} onValueChange={(value) => setAssistantEffort(EffortSchema.parse(value))}>
          <SelectTrigger size="sm" className="text-xs" aria-label="Effort level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EffortSchema.options.map((level) => (
              <SelectItem key={level} value={level} className="text-xs">
                {EFFORT_LABELS[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-muted-foreground">No effort levels</span>
      )}
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
