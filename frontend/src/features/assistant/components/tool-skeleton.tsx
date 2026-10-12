import { Skeleton } from '@/components/ui/skeleton';

/** A tool call still being written (or run): its label over a placeholder. */
export function ToolSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Skeleton className="h-32" />
    </div>
  );
}
