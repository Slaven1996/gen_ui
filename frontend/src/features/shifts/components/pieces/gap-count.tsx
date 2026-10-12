import { CircleAlert } from 'lucide-react';

/** How many people are still missing that day. */
export function GapCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 text-[11px] font-medium tabular-nums text-destructive"
      title={`${count} ${count === 1 ? 'person' : 'people'} missing`}
    >
      <CircleAlert className="size-3" />
      {count}
    </span>
  );
}
