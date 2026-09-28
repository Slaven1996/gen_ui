import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import {
  AssistantModelSchema,
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_EFFORT,
  EffortSchema,
  type AssistantModel,
  type Effort,
} from '@gen-ui/shared';

/**
 * A UI preference kept in the browser. `localStorage` is shared by every tab
 * and survives restarts; `sessionStorage` belongs to one tab and survives its
 * reloads only. A stored value that no longer fits the schema, or storage
 * that is unavailable, just means the default.
 */
function preference<T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
  storage: 'localStorage' | 'sessionStorage' = 'localStorage',
) {
  const listeners = new Set<() => void>();
  let value = fallback;
  try {
    const stored = window[storage].getItem(key);
    const parsed = stored === null ? undefined : schema.safeParse(JSON.parse(stored));
    if (parsed?.success) value = parsed.data;
  } catch {
    // Storage unavailable or not JSON: keep the default.
  }

  return {
    get: (): T => value,
    set(next: T): void {
      value = next;
      try {
        window[storage].setItem(key, JSON.stringify(next));
      } catch {
        // UI preference only — fine to lose.
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Whether the side panel is open — per tab, so a page opened in a new tab
 * (such as "Open in new tab" from a chat answer) starts with it closed.
 */
const open = preference('gen-ui:assistant-open', z.boolean(), false, 'sessionStorage');

export const setAssistantOpen = open.set;
export const toggleAssistant = (): void => open.set(!open.get());
export function useAssistantOpen(): boolean {
  return useSyncExternalStore(open.subscribe, open.get);
}

/**
 * "Generate UI components": on, tool results render as components; off, the
 * assistant answers in Markdown. Sent with every chat request.
 */
const generateUi = preference('gen-ui:assistant-generate-ui', z.boolean(), true);

export const getGenerateUi = generateUi.get;
export const setGenerateUi = generateUi.set;
export function useGenerateUi(): boolean {
  return useSyncExternalStore(generateUi.subscribe, generateUi.get);
}

/** The Claude model that answers the next message. Sent with every chat request. */
const model = preference('gen-ui:assistant-model', AssistantModelSchema, DEFAULT_ASSISTANT_MODEL);

export const getAssistantModel = model.get;
export const setAssistantModel = model.set;
export function useAssistantModel(): AssistantModel {
  return useSyncExternalStore(model.subscribe, model.get);
}

/** The effort level for models that have one; the server ignores it for the others. */
const effort = preference('gen-ui:assistant-effort', EffortSchema, DEFAULT_EFFORT);

export const getAssistantEffort = effort.get;
export const setAssistantEffort = effort.set;
export function useAssistantEffort(): Effort {
  return useSyncExternalStore(effort.subscribe, effort.get);
}
