import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isStaticToolUIPart, isTextUIPart } from 'ai';
import { ASSISTANT_MODELS, AssistantModelSchema, type GenUIMessage, type GenUIMetadata } from '@gen-ui/shared';
import { ToolPartView, ToolStatusLine } from './tool-parts';

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
        if (part.type === 'text') return <Markdown key={index}>{part.text}</Markdown>;
        if (part.type === 'reasoning') {
          return part.text.trim() ? <Reasoning key={index} text={part.text} /> : null;
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

function Reasoning({ text }: { text: string }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">Reasoning</summary>
      <div className="mt-2 border-l pl-3 whitespace-pre-wrap">{text}</div>
    </details>
  );
}

/**
 * Model text → Markdown. react-markdown never renders raw HTML and sanitises
 * link URLs, so streamed model output can't inject markup.
 */
function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed break-words [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:py-1 [&_td]:pr-3 [&_th]:py-1 [&_th]:pr-3 [&_th]:font-medium [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
