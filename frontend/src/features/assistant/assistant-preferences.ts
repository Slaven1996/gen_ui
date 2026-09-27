import { useSyncExternalStore } from 'react';

/**
 * A boolean UI preference kept in this browser. Losing it (private mode,
 * cleared storage) only means the default comes back.
 */
function preference(key: string, fallback: boolean) {
  const listeners = new Set<() => void>();
  let value = fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) value = stored === 'true';
  } catch {
    // Storage unavailable: keep the default.
  }

  return {
    get: (): boolean => value,
    set(next: boolean): void {
      value = next;
      try {
        window.localStorage.setItem(key, String(next));
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

/** Whether the side panel is open. */
const open = preference('gen-ui:assistant-open', false);

export const setAssistantOpen = open.set;
export const toggleAssistant = (): void => open.set(!open.get());
export function useAssistantOpen(): boolean {
  return useSyncExternalStore(open.subscribe, open.get);
}

/**
 * "Generate UI components": on, tool results render as components; off, the
 * assistant answers in Markdown. Sent with every chat request.
 */
const generateUi = preference('gen-ui:assistant-generate-ui', true);

export const getGenerateUi = generateUi.get;
export const setGenerateUi = generateUi.set;
export function useGenerateUi(): boolean {
  return useSyncExternalStore(generateUi.subscribe, generateUi.get);
}
