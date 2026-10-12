import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateTime, formatRelative } from '@/lib/format';

/** A timestamp as "5 min ago", with the exact time on hover. */
export function RelativeTime({ iso, className }: { iso: string | null; className?: string }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} className={className ?? 'text-sm whitespace-nowrap tabular-nums'}>
          {formatRelative(iso)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(iso)}</TooltipContent>
    </Tooltip>
  );
}
