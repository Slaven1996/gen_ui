import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/** A labelled row of the widget settings form. */
export function WidgetConfigRow({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">{children}</div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
