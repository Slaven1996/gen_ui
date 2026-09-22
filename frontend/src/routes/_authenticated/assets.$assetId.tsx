import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, LineChart, Pencil, PenLine } from 'lucide-react';
import { ListAlarmsQuerySchema, ListDevicesQuerySchema, ListLogbookQuerySchema, ListTagsQuerySchema, OPEN_ALARM_STATES } from '@gen-ui/shared';
import { PageContainer } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewCard, ViewFullPageLink } from '@/components/view-card';
import { AlarmsTable } from '@/features/alarms/alarms-table';
import { KpiTile } from '@/features/analytics/kpi';
import { assetQueryOptions, tagsListQueryOptions } from '@/features/assets/api';
import { AssetFormDialog } from '@/features/assets/asset-form-dialog';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { DevicesTable } from '@/features/devices/devices-table';
import { EntryFormDialog } from '@/features/logbook/entry-form-dialog';
import { LogbookFeed } from '@/features/logbook/logbook-table';
import { TagsTable } from '@/features/tags/tags-table';
import { useAuth } from '@/lib/auth/auth-store';
import { ASSET_TYPE } from '@/lib/labels';

export const Route = createFileRoute('/_authenticated/assets/$assetId')({
  staticData: { title: 'Asset' },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(assetQueryOptions(params.assetId)),
  component: AssetPage,
});

/**
 * One asset, built entirely from embeddable views. Each card runs the same
 * query its full page would, scoped to this asset, and links there — so the
 * page is a preview of four filtered lists.
 */
function AssetPage() {
  const { assetId } = Route.useParams();
  const { user } = useAuth();
  const asset = useQuery(assetQueryOptions(assetId));
  const analogTags = useQuery(tagsListQueryOptions({ assetId, dataType: ['ANALOG'], pageSize: 8 }));
  const [editing, setEditing] = useState(false);
  const [writing, setWriting] = useState(false);

  useAssistantContext({
    title: asset.data ? `Asset: ${asset.data.name}` : 'Asset',
    summary: asset.data
      ? `${ASSET_TYPE[asset.data.type].label} ${asset.data.name} (${asset.data.code}), asset id ${asset.data.id}`
      : undefined,
  });

  if (!asset.data) return <PageContainer><Skeleton className="h-40" /></PageContainer>;
  const data = asset.data;
  const { icon: TypeIcon, label: typeLabel } = ASSET_TYPE[data.type];

  // Each card shows a few rows of a filtered list; "View full page" opens that
  // list with the same filters (and the page's own paging).
  const alarmFilters = { assetId, state: [...OPEN_ALARM_STATES] };
  const alarmQuery = ListAlarmsQuerySchema.parse({ ...alarmFilters, pageSize: 5 });
  const deviceQuery = ListDevicesQuerySchema.parse({ assetId, pageSize: 5 });
  const tagQuery = ListTagsQuerySchema.parse({ assetId, pageSize: 8 });
  const logbookQuery = ListLogbookQuerySchema.parse({ assetId, pageSize: 6 });
  const plotTags = (analogTags.data?.items ?? []).map((tag) => tag.id);

  return (
    <PageContainer className="max-w-7xl">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link to="/assets" className="hover:text-foreground">
          Assets
        </Link>
        {data.ancestors.map((ancestor) => (
          <span key={ancestor.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5" />
            <Link to="/assets/$assetId" params={{ assetId: ancestor.id }} className="hover:text-foreground">
              {ancestor.name}
            </Link>
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <TypeIcon className="size-6 text-muted-foreground" aria-hidden />
            {data.name}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{typeLabel}</Badge>
            <span>{data.code}</span>
            {!data.isActive && <Badge variant="secondary">Out of service</Badge>}
            {data.address && <span>· {data.address}</span>}
          </p>
          {data.description && <p className="max-w-2xl text-sm">{data.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild disabled={plotTags.length === 0}>
            <Link to="/graphs" search={{ tagIds: plotTags, range: '24h' }}>
              <LineChart />
              Plot readings
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setWriting(true)}>
            <PenLine />
            Log entry
          </Button>
          {user?.role === 'ADMIN' && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile metric="OPEN_ALARMS" assetId={assetId} />
        <KpiTile metric="DEVICES_OFFLINE" assetId={assetId} />
        <KpiTile metric="TAGS" assetId={assetId} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <ViewCard title="Open alarms" description="Here and below" action={<ViewFullPageLink to="/alarms" search={alarmFilters} />}>
            <AlarmsTable query={alarmQuery} compact />
          </ViewCard>
          <ViewCard title="Readings" description="Latest value per tag" action={<ViewFullPageLink to="/tags" search={{ assetId }} />}>
            <TagsTable query={tagQuery} compact />
          </ViewCard>
          <ViewCard title="Devices" action={<ViewFullPageLink to="/devices" search={{ assetId }} />}>
            <DevicesTable query={deviceQuery} compact />
          </ViewCard>
        </div>
        <div className="min-w-0 space-y-4">
          <ViewCard title="Details">
            <AssetDetails>
              <Detail label="Parent">{data.parent?.name ?? 'Top level'}</Detail>
              <Detail label="Contains">
                {data.childCount} sub-assets, {data.deviceCount} devices
              </Detail>
              {data.latitude !== null && data.longitude !== null && (
                <Detail label="Location">
                  {data.latitude.toFixed(4)}, {data.longitude.toFixed(4)}
                </Detail>
              )}
              {Object.entries(data.metadata ?? {}).map(([key, value]) => (
                <Detail key={key} label={key}>
                  {String(value)}
                </Detail>
              ))}
            </AssetDetails>
            {data.childCount > 0 && (
              <Button asChild variant="link" className="mt-2 h-auto px-0">
                <Link to="/assets" search={{ parentId: data.id }}>
                  List its sub-assets
                </Link>
              </Button>
            )}
          </ViewCard>
          <ViewCard title="Logbook" action={<ViewFullPageLink to="/logbook" search={{ assetId }} />}>
            <LogbookFeed query={logbookQuery} />
          </ViewCard>
        </div>
      </div>

      <AssetFormDialog open={editing} onOpenChange={setEditing} asset={data} />
      <EntryFormDialog open={writing} onOpenChange={setWriting} initialAssetId={data.id} />
    </PageContainer>
  );
}

function AssetDetails({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">{children}</dl>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
