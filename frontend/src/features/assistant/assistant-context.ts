import { useEffect } from 'react';
import type { ChatContext } from '@gen-ui/shared';

type PageContext = Omit<ChatContext, 'pathname'>;

let pageContext: PageContext = {};

/** Sent with every chat request so the assistant knows what the user is looking at. */
export function getAssistantContext(): ChatContext {
  return { pathname: window.location.pathname, ...pageContext };
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
