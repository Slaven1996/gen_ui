import type { ReactNode } from 'react';

/** One labelled line of the alarm detail. */
export function AlarmDetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
