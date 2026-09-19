import type { DeepPartial } from 'ai';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { GenUITools, StatCard } from '@gen-ui/shared';
import { Card, CardContent } from '@/components/ui/card';
import { ToolError, ToolSkeleton } from './tool-status';
import type { ToolPartFor } from './types';

type StatCardsInput = GenUITools['showStatCards']['input'];

const isComplete = (card: DeepPartial<StatCard> | undefined): card is StatCard =>
  Boolean(card?.label && card.value);

/** Renders progressively: each card appears as soon as its fields have streamed in. */
export function StatCardsTool({ part }: { part: ToolPartFor<'showStatCards'> }) {
  if (part.state === 'output-error') {
    return <ToolError title="Couldn’t show these numbers" message={part.errorText} />;
  }

  const input = part.input as DeepPartial<StatCardsInput> | undefined;
  const cards = (input?.cards ?? []).filter(isComplete);
  if (cards.length === 0) return <ToolSkeleton label="Preparing numbers…" shape="cards" />;

  return (
    <section className="space-y-2">
      {input?.title && <h3 className="text-sm font-medium">{input.title}</h3>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {cards.map((card, index) => (
          <StatCardView key={index} card={card} />
        ))}
      </div>
    </section>
  );
}

function StatCardView({ card }: { card: StatCard }) {
  const { label, value, change, hint } = card;
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {change !== undefined && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            <span className="sr-only">{change >= 0 ? 'Up' : 'Down'}</span>
            {Math.abs(change)}%
          </p>
        )}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
