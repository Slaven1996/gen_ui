import type { LogbookEntry } from '@gen-ui/shared';
import { StatusDot } from '@/components/status-dot';
import { formatDateTime, formatRelative } from '@/lib/format';
import { LOG_SEVERITY, LOGBOOK_CATEGORY } from '@/lib/labels';
import { cn } from '@/lib/utils';

/** Entries as a vertical timeline: an alarm's history, or a compact feed. */
export function LogbookTimeline({
  entries,
  showAsset = true,
  className,
}: {
  entries: LogbookEntry[];
  showAsset?: boolean;
  className?: string;
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing recorded.</p>;
  }

  return (
    <ol className={cn('relative space-y-4 border-l pl-5', className)}>
      {entries.map((entry) => {
        const Icon = LOGBOOK_CATEGORY[entry.category].icon;
        return (
          <li key={entry.id} className="relative">
            <span className="absolute top-0.5 -left-[1.9rem] flex size-5 items-center justify-center rounded-full border bg-background">
              <Icon className="size-3 text-muted-foreground" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              {entry.severity !== 'INFO' && <StatusDot tone={LOG_SEVERITY[entry.severity].tone} />}
              <span className="font-medium">{entry.title}</span>
            </div>
            {entry.body && <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{entry.body}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              <time dateTime={entry.occurredAt} title={formatDateTime(entry.occurredAt)}>
                {formatRelative(entry.occurredAt)}
              </time>
              {' · '}
              {entry.author?.name ?? 'System'}
              {showAsset && entry.asset && ` · ${entry.asset.name}`}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
