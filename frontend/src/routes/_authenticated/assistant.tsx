import { createFileRoute } from '@tanstack/react-router';
import { ChatThread } from '@/features/assistant/chat-thread';

export const Route = createFileRoute('/_authenticated/assistant')({
  staticData: { title: 'Assistant' },
  component: AssistantPage,
});

/** The assistant: the signed-in user's saved conversation. */
function AssistantPage() {
  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] w-full max-w-5xl flex-col">
      <ChatThread />
    </div>
  );
}
