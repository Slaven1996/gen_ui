import { isFormToolPart } from '@gen-ui/shared';
import { ViewFullPageLink } from '@/components/view-full-page-link';
import { rendererFor } from '../lib/tool-renderers';
import { useChatInstance } from '../store/chat-store';
import type { GenUIToolPart } from '../types';
import { FormStatusLine } from './form-status-line';

/** A tool call in a text-only answer: one muted line, with the same link. */
export function ToolStatusLine({ part, streaming = false }: { part: GenUIToolPart; streaming?: boolean }) {
  const chat = useChatInstance();
  if (isFormToolPart(part)) return <FormStatusLine part={part} />;
  const renderer = rendererFor(part);
  switch (part.state) {
    case 'input-streaming':
      return <p className="text-xs text-muted-foreground">{renderer.pending}</p>;
    case 'output-error':
      return <p className="text-xs text-destructive">{part.errorText}</p>;
    default: {
      const call = {
        conversationId: chat?.id,
        toolCallId: part.toolCallId,
        done: part.state === 'output-available' && !streaming,
      };
      return (
        <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          <span>
            {renderer.title(part.input)}
            {part.state === 'output-available' && ` · ${renderer.found(part.output)}`}
          </span>
          <ViewFullPageLink {...renderer.link(part.input, call)} newTab />
        </div>
      );
    }
  }
}
