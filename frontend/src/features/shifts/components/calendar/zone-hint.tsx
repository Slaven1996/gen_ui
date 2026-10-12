import { utcOffset } from '@gen-ui/shared';
import { browserTimeZone } from '@/lib/search';

/** "Times in Europe/Budapest" — only when that isn't the viewer's own clock. */
/** Names the plant time zone when it differs from the browser one. */
export function ZoneHint({ timeZone }: { timeZone: string }) {
  if (utcOffset(timeZone) === utcOffset(browserTimeZone)) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Times in {timeZone} (UTC{utcOffset(timeZone)})
    </p>
  );
}
