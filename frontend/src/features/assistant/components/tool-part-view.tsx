import { isFormToolPart } from '@gen-ui/shared';
import { rendererFor } from '../lib/tool-renderers';
import type { GenUIToolPart } from '../types';
import { FormPartView } from './form-part-view';
import { ListToolCard } from './list-tool-card';
import { ToolError } from './tool-error';
import { ToolSkeleton } from './tool-skeleton';

/**
 * A tool call as a component: a skeleton while it is written, then its view
 * and "Open in new tab". `streaming`: the answer holding it is still arriving.
 */
export function ToolPartView({
  conversationId,
  part,
  streaming = false,
}: {
  conversationId: string;
  part: GenUIToolPart;
  streaming?: boolean;
}) {
  if (isFormToolPart(part)) return <FormPartView conversationId={conversationId} part={part} streaming={streaming} />;
  const renderer = rendererFor(part);
  switch (part.state) {
    case 'input-streaming':
      return <ToolSkeleton label={renderer.pending} />;
    case 'output-error':
      return <ToolError message={part.errorText} />;
    default: {
      const call = {
        conversationId,
        toolCallId: part.toolCallId,
        done: part.state === 'output-available' && !streaming,
      };
      // The query is complete, so the view can fetch while the server still runs the tool.
      return <ListToolCard renderer={renderer} input={part.input} call={call} />;
    }
  }
}
