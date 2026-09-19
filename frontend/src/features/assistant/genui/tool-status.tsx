import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

type SkeletonShape = 'cards' | 'chart' | 'table';

/** Placeholder while a tool's input is still streaming or its result is loading. */
export function ToolSkeleton({ label, shape }: { label: string; shape: SkeletonShape }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="text-xs text-muted-foreground">{label}</p>
      {shape === 'cards' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      )}
      {shape === 'chart' && <Skeleton className="h-56" />}
      {shape === 'table' && (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-8" />
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolError({ title, message }: { title: string; message?: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      {message && <AlertDescription>{message}</AlertDescription>}
    </Alert>
  );
}
