import { createFileRoute } from '@tanstack/react-router';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { ChatThread } from '@/features/assistant/chat-thread';

export const Route = createFileRoute('/_authenticated/assistant')({
  staticData: { title: 'Assistant' },
  component: AssistantPage,
});

/** Full-page view of the same conversation as the side panel. */
function AssistantPage() {
  useAssistantContext({ title: 'Assistant' });

  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] w-full max-w-3xl flex-col">
      <ChatThread />
    </div>
  );
}
