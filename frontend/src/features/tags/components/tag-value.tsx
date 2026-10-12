import type { Tag } from '@gen-ui/shared';
import { formatReading } from '@/lib/format';

/** A reading as shown in lists: digital tags read as on/off. */
export function TagValue({ tag }: { tag: Pick<Tag, 'lastValue' | 'unit' | 'dataType'> }) {
  if (tag.lastValue === null) return <span className="text-muted-foreground">No data</span>;
  if (tag.dataType === 'DIGITAL') return <span>{tag.lastValue >= 0.5 ? 'On (1)' : 'Off (0)'}</span>;
  return <span>{formatReading(tag.lastValue, tag.unit)}</span>;
}
