import { useEffect } from 'react';
import type { ChatContext } from '@gen-ui/shared';
import { browserTimeZone } from '@/lib/search';

type PageContext = Omit<ChatContext, 'pathname' | 'timeZone'>;

let pageContext: PageContext = {};

/**
 * Sent with every chat request so the assistant knows what the user is
 * looking at, and which day "today" is for them.
 */
export function getAssistantContext(): ChatContext {
  return { pathname: window.location.pathname, timeZone: browserTimeZone, ...pageContext };
}

/** Pages describe themselves to the assistant; cleared again on unmount. */
export function useAssistantContext({ title, summary }: PageContext): void {
  useEffect(() => {
    pageContext = { title, summary };
    return () => {
      pageContext = {};
    };
  }, [title, summary]);
}
