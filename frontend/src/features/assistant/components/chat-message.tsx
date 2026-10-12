import { isStaticToolUIPart, isTextUIPart } from 'ai';
import { ASSISTANT_MODELS, AssistantModelSchema, type GenUIMessage, type GenUIMetadata } from '@gen-ui/shared';
import { MessageMarkdown } from './message-markdown';
import { MessageReasoning } from './message-reasoning';
import { ToolPartView } from './tool-part-view';
import { ToolStatusLine } from './tool-status-line';

/**
 * One message, rendered purely from its parts, so a restored conversation
 * looks as it did. The parts come from the model [AI]: its text, its
 * reasoning summary, and its tool calls. How each part looks is fixed [app].
 * `streaming`: this is the answer still arriving (a form in it waits for it).
 */
export function ChatMessage({ message, streaming = false }: { message: GenUIMessage; streaming?: boolean }) {
  if (message.role === 'user') {
    const text = message.parts
      .filter(isTextUIPart)
      .map((part) => part.text)
      .join('\n');
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }

  // An answer keeps the mode it was given in, whatever the toggle says now.
  const generateUi = message.metadata?.generateUi !== false;
  const model = answeredBy(message.metadata);

  return (
    <div className="space-y-3">
      {message.parts.map((part, index) => {
        if (part.type === 'text') return <MessageMarkdown key={index}>{part.text}</MessageMarkdown>;
        if (part.type === 'reasoning') {
          return part.text.trim() ? <MessageReasoning key={index} text={part.text} /> : null;
        }
        if (isStaticToolUIPart(part)) {
          return generateUi ? (
            <ToolPartView key={part.toolCallId} part={part} streaming={streaming} />
          ) : (
            <ToolStatusLine key={part.toolCallId} part={part} />
          );
        }
        return null;
      })}
      {message.metadata?.finishReason === 'content-filter' && (
        <p className="text-xs text-muted-foreground">The model declined to complete this request.</p>
      )}
      {message.metadata?.finishReason === 'length' && (
        <p className="text-xs text-muted-foreground">The response hit the length limit and was cut short.</p>
      )}
      {model && <p className="text-[11px] text-muted-foreground">{model}</p>}
    </div>
  );
}

/** "Claude Opus 5 · high effort", from the metadata saved with the answer. */
function answeredBy(metadata: GenUIMetadata | undefined): string | undefined {
  if (!metadata?.model) return undefined;
  const known = AssistantModelSchema.safeParse(metadata.model);
  const name = known.success ? ASSISTANT_MODELS[known.data].label : metadata.model;
  return metadata.effort ? `${name} · ${metadata.effort} effort` : name;
}
