import { RELATIVE_RANGE_LABELS, type RelativeRange } from '@gen-ui/shared';
import { formatShortDateTime } from '@/lib/format';

export interface TimeRangeValue {
  range?: RelativeRange;
  from?: string;
  to?: string;
}

/** Every key present, so merging it into search params clears the ones not in use. */
export interface TimeRangeChange {
  range: RelativeRange | undefined;
  from: string | undefined;
  to: string | undefined;
}

export function describeTimeRange({ range, from, to }: TimeRangeValue, anyLabel = 'Any time'): string {
  if (from || to) return `${from ? formatShortDateTime(from) : '…'} – ${to ? formatShortDateTime(to) : 'now'}`;
  return range ? RELATIVE_RANGE_LABELS[range] : anyLabel;
}
