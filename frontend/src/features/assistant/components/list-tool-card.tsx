import { useState } from 'react';
import { ViewCard } from '@/components/view-card';
import { ViewFullPageLink } from '@/components/view-full-page-link';
import type { ListToolName, ToolCall, ToolInput, ToolLink, ToolRenderer } from '../types';

/**
 * A list tool's view in its frame. The link starts as the call's query and
 * follows the view's filters. A view that is a card of its own places the
 * link itself.
 */
export function ListToolCard({
  renderer,
  input,
  call,
}: {
  renderer: ToolRenderer<ListToolName>;
  input: ToolInput<ListToolName>;
  call: ToolCall;
}) {
  const [changed, setLink] = useState<ToolLink>();
  const link = changed ?? renderer.link(input, call);
  const { Body } = renderer;
  const action = <ViewFullPageLink {...link} newTab />;
  if (renderer.framed === false) return <Body input={input} call={call} action={action} />;
  return (
    <ViewCard title={renderer.title(input)} action={action}>
      <Body input={input} call={call} onLinkChange={setLink} />
    </ViewCard>
  );
}
