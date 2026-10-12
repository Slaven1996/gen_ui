import type { ReactNode } from 'react';

/** A detail's labelled values (`DetailRow`s), labels on the left. */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">{children}</dl>;
}
