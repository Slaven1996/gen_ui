import { isStaticToolUIPart, isTextUIPart } from 'ai';
import type { GenUIMessage } from '@gen-ui/shared';
import { GenUiToolPart } from './genui/registry';
import { Markdown } from './markdown';

export function ChatMessage({ message }: { message: GenUIMessage }) {
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

  return (
    <div className="space-y-3">
      {message.parts.map((part, index) => {
        if (part.type === 'text') return <Markdown key={index}>{part.text}</Markdown>;
        if (part.type === 'reasoning') {
          return part.text.trim() ? <Reasoning key={index} text={part.text} /> : null;
        }
        if (isStaticToolUIPart(part)) return <GenUiToolPart key={part.toolCallId} part={part} />;
        return null;
      })}
      {message.metadata?.finishReason === 'content-filter' && (
        <p className="text-xs text-muted-foreground">The model declined to complete this request.</p>
      )}
      {message.metadata?.finishReason === 'length' && (
        <p className="text-xs text-muted-foreground">The response hit the length limit and was cut short.</p>
      )}
    </div>
  );
}

function Reasoning({ text }: { text: string }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">Reasoning</summary>
      <div className="mt-2 border-l pl-3 whitespace-pre-wrap">{text}</div>
    </details>
  );
}
