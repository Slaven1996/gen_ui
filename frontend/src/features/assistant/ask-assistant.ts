import { setAssistantOpen } from './assistant-panel-state';
import { getChat } from './chat-store';

/** Open the assistant panel and send a prompt — for "Ask AI" entry points inside pages. */
export function askAssistant(text: string): void {
  setAssistantOpen(true);
  void getChat().sendMessage({ text });
}
