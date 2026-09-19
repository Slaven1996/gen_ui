import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'gen-ui:assistant-open';

function readInitial(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let open = readInitial();
const listeners = new Set<() => void>();

export function setAssistantOpen(next: boolean): void {
  open = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // UI preference only — fine to lose.
  }
  listeners.forEach((listener) => listener());
}

export function toggleAssistant(): void {
  setAssistantOpen(!open);
}

export function useAssistantOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}
