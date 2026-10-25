import { CONVERSATION_TITLE_MAX, type AssistantModel, type GenUIMessage } from '@gen-ui/shared';

/*
 * A chat's title. Its row is created with the first question as the title;
 * while the first answer streams, a cheap model writes a short one, which
 * replaces it when the answer ends (unless the user renamed the chat by then).
 */

/** The title writer: the cheapest model, whichever one answers the chat. */
export const TITLE_MODEL: AssistantModel = 'claude-haiku-4-5';

/** The question is clipped to this before it goes to the title writer. */
export const TITLE_QUESTION_LENGTH = 1_000;

export const TITLE_INSTRUCTIONS = [
  'You name chats between staff of a water utility and an assistant for its monitoring app.',
  'Write a title of 3 to 6 words for a chat that starts with the question below.',
  'Use the language of the question (English or Serbian).',
  'Reply with the title only: no quotes, no "Title:" prefix, no trailing period.',
].join(' ');

/** The text of the first user message, whitespace collapsed; empty if it has none. */
export function firstQuestion(messages: GenUIMessage[]): string {
  const first = messages.find((message) => message.role === 'user');
  return (first?.parts ?? [])
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The title a chat is saved with: its first question, clipped. */
export function provisionalTitle(messages: GenUIMessage[]): string {
  return clip(firstQuestion(messages));
}

/** The title writer's reply as a title, or `null` when nothing usable is left. */
export function cleanTitle(raw: string): string | null {
  const line = raw.trim().split('\n')[0] ?? '';
  const title = line
    .replace(/^#+\s*/, '')
    .replace(/^\W*title\s*:\s*/i, '')
    // Quotes and emphasis around it, and a trailing period (inside or outside the quotes).
    .replace(/^[\s"'`“”„‘’*_]+|[\s"'`“”„‘’*_.]+$/g, '')
    .replace(/\s+/g, ' ');
  return title ? clip(title) : null;
}

function clip(text: string): string {
  return text.length > CONVERSATION_TITLE_MAX ? `${text.slice(0, CONVERSATION_TITLE_MAX - 1)}…` : text;
}
