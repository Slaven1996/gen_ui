import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { GraphQuerySchema } from '@gen-ui/shared';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { seriesQueryOptions } from '@/features/telemetry/api';
import { TagStatsTable } from '@/features/telemetry/tag-stats-table';
import { TelemetryExplorer } from '@/features/telemetry/telemetry-explorer';
import { defaultsOf, searchSchema } from '@/lib/search';

/** The chart's query is the URL (`GraphQuerySchema`): a bookmark is a saved chart. */
export const Route = createFileRoute('/_authenticated/graphs')({
  staticData: { title: 'Graphs' },
  validateSearch: searchSchema(GraphQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(GraphQuerySchema))] },
  loaderDeps: ({ search: { chartType: _chartType, ...query } }) => query,
  loader: ({ context, deps }) =>
    deps.tagIds?.length ? context.queryClient.ensureQueryData(seriesQueryOptions(deps)) : undefined,
  component: GraphsPage,
});

function GraphsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied — it opens this exact chart');
  };

  return (
    <PageContainer>
      <PageHeader
        title="Graphs"
        description="Plot up to eight tags. Tags with different units get their own chart on a shared time axis."
        actions={
          <Button variant="outline" onClick={copyLink} disabled={!search.tagIds?.length}>
            <Link2 />
            Copy link
          </Button>
        }
      />

      <TelemetryExplorer query={search} onQueryChange={(next) => navigate({ search: next, replace: true })} height={380} />

      <TagStatsTable query={{ tagIds: search.tagIds, range: search.range, from: search.from, to: search.to }} />
    </PageContainer>
  );
}
