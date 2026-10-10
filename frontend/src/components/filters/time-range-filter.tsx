import { useId, useState } from 'react';
import { CalendarClock, ChevronDown } from 'lucide-react';
import { RELATIVE_RANGE_LABELS, RELATIVE_RANGES, type RelativeRange } from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { formatShortDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

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

/** `<input type="datetime-local">` speaks local wall-clock time without a zone. */
const toLocalInput = (iso: string | undefined) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : undefined);

export function describeTimeRange({ range, from, to }: TimeRangeValue, anyLabel = 'Any time'): string {
  if (from || to) return `${from ? formatShortDateTime(from) : '…'} – ${to ? formatShortDateTime(to) : 'now'}`;
  return range ? RELATIVE_RANGE_LABELS[range] : anyLabel;
}

/**
 * Relative presets (which keep a link "live") or a custom absolute window.
 * `onChange` always gets all three keys, so stale ones are cleared.
 */
export function TimeRangeFilter({
  value,
  onChange,
  presets = RELATIVE_RANGES,
  allowAny = true,
  className,
}: {
  value: TimeRangeValue;
  onChange: (value: TimeRangeChange) => void;
  presets?: readonly RelativeRange[];
  /** Offer "Any time" (no filter). Charts need a window, so they turn this off. */
  allowAny?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(toLocalInput(value.from));
  const [draftTo, setDraftTo] = useState(toLocalInput(value.to));
  const custom = Boolean(value.from || value.to);

  const pick = (range: RelativeRange | undefined) => {
    onChange({ range, from: undefined, to: undefined });
    setOpen(false);
  };

  const applyCustom = () => {
    onChange({ range: undefined, from: fromLocalInput(draftFrom), to: fromLocalInput(draftTo) });
    setOpen(false);
  };

  const invalid = Boolean(draftFrom && draftTo && new Date(draftFrom) >= new Date(draftTo));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraftFrom(toLocalInput(value.from));
          setDraftTo(toLocalInput(value.to));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-start', className)} aria-label="Time range">
          <CalendarClock className="opacity-60" />
          <span className="truncate">{describeTimeRange(value)}</span>
          <ChevronDown className="ml-auto opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="grid grid-cols-2 gap-1">
          {allowAny && (
            <PresetButton active={!custom && !value.range} onClick={() => pick(undefined)}>
              Any time
            </PresetButton>
          )}
          {presets.map((range) => (
            <PresetButton key={range} active={!custom && value.range === range} onClick={() => pick(range)}>
              {RELATIVE_RANGE_LABELS[range]}
            </PresetButton>
          ))}
        </div>
        <Separator className="my-2" />
        <div className="space-y-2 p-1">
          <p className="text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="space-y-1">
            <Label htmlFor={`${id}-from`} className="text-xs">
              From
            </Label>
            <Input id={`${id}-from`} type="datetime-local" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-to`} className="text-xs">
              To <span className="text-muted-foreground">(empty = now)</span>
            </Label>
            <Input id={`${id}-to`} type="datetime-local" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} />
          </div>
          {invalid && <p className="text-xs text-destructive">“From” must be before “To”.</p>}
          <Button size="sm" className="w-full" disabled={!draftFrom || invalid} onClick={applyCustom}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant={active ? 'secondary' : 'ghost'} size="sm" className="justify-start font-normal" onClick={onClick}>
      {children}
    </Button>
  );
}
