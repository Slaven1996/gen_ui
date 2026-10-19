import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A widget that can't be shown yet, in place of its view: it still lacks a
 * tag or a figure, or names one that no longer exists. Its view isn't drawn,
 * so no request goes out with a bad query. While editing, a click opens the
 * widget's settings with the problem marked.
 */
export function WidgetIssueCard({ title, reason, onFix }: { title: string; reason: string; onFix?: () => void }) {
  const card = (
    <Card className={cn('h-full min-h-0 gap-3 border-2 border-destructive/70 py-4', onFix && 'hover:bg-accent/50')}>
      <CardHeader className="px-4">
        <CardTitle className="truncate text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-start gap-2 px-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {reason}
          {onFix && <span className="block text-xs text-muted-foreground">Click to set it up.</span>}
        </span>
      </CardContent>
    </Card>
  );
  if (!onFix) return card;
  return (
    <button
      type="button"
      onClick={onFix}
      aria-label={`Set up ${title}: ${reason}`}
      className="block h-full w-full rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {card}
    </button>
  );
}
