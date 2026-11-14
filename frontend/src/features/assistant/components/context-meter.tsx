import { ASSISTANT_MODELS, type GenUIMessage } from '@gen-ui/shared';
import { cn } from '@/lib/utils';
import { useAssistantModel } from '../store/assistant-preferences';

const TOKENS = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** From this share of the window on, the bar turns red: a new chat is due. */
const NEARLY_FULL = 0.8;

/**
 * How full this chat's context is: the latest answer's `contextTokens` (what
 * its last model call was sent plus what it wrote) against the window of the
 * model picked for the next message. Hidden until an answer has a size.
 */
export function ContextMeter({ messages }: { messages: GenUIMessage[] }) {
  const model = useAssistantModel();
  const tokens = messages.findLast((message) => message.metadata?.contextTokens !== undefined)?.metadata
    ?.contextTokens;
  if (tokens === undefined) return null;

  const { contextWindow } = ASSISTANT_MODELS[model];
  const share = Math.min(tokens / contextWindow, 1);

  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title="What the last answer sent to Claude (instructions, tools, this chat, tool results) plus what it wrote"
    >
      <div
        role="meter"
        aria-label="Context used"
        aria-valuemin={0}
        aria-valuemax={contextWindow}
        aria-valuenow={tokens}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', share >= NEARLY_FULL ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <span>
        {TOKENS.format(tokens)} / {TOKENS.format(contextWindow)} context
      </span>
    </div>
  );
}
