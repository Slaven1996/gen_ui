import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ChatThread } from '@/features/assistant/components/chat-thread';
import { searchSchema } from '@/lib/search';

/** `chat`: the open chat; without it, a new one (it gets its id here once its first message is sent). */
const assistantSearch = z.object({
  chat: z.uuid().optional(),
});

export const Route = createFileRoute('/_authenticated/assistant')({
  staticData: { title: 'Assistant' },
  validateSearch: searchSchema(assistantSearch),
  component: AssistantPage,
});

/** The assistant: one of the signed-in user's chats, picked in the sidebar, or a new one. */
function AssistantPage() {
  const { chat } = Route.useSearch();
  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] w-full max-w-5xl flex-col">
      <ChatThread chatId={chat} />
    </div>
  );
}
