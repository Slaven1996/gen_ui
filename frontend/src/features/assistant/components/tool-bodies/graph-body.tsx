import { useState } from 'react';
import { GraphQuerySchema } from '@gen-ui/shared';
import { TelemetryExplorer } from '@/features/telemetry/components/telemetry-explorer';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput, ToolLink } from '../../types';

/** The Graphs page's chart with its filters, without the stats table; the link follows the filters. */
export function GraphBody({ input, onLinkChange }: { input: ToolInput<'plotTags'>; onLinkChange?: (link: ToolLink) => void }) {
  const [query, setQuery] = useState(() => GraphQuerySchema.parse(withoutTitle(input)));
  return (
    <TelemetryExplorer
      query={query}
      onQueryChange={(next) => {
        setQuery(next);
        onLinkChange?.({ to: '/graphs', search: next });
      }}
      height={300}
      framed={false}
      className="space-y-3"
    />
  );
}

