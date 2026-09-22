import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check, LayoutDashboard, MoreHorizontal, Pencil, Plus, Share2 } from 'lucide-react';
import { z } from 'zod';
import type { Dashboard, DashboardWidget } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageContainer } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { dashboardQueryOptions, dashboardsQueryOptions, useDeleteDashboard } from '@/features/dashboards/api';
import { DashboardFormDialog } from '@/features/dashboards/dashboard-form-dialog';
import { DashboardGrid } from '@/features/dashboards/dashboard-grid';
import { WidgetDialog } from '@/features/dashboards/widget-dialog';
import { useAuth } from '@/lib/auth/auth-store';
import { searchSchema } from '@/lib/search';

/** `board`: which dashboard is open. Without it, the first of your own. */
const dashboardSearch = z.object({ board: z.guid().optional() });

export const Route = createFileRoute('/_authenticated/dashboard')({
  staticData: { title: 'Dashboard' },
  validateSearch: searchSchema(dashboardSearch),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardsQueryOptions()),
  component: DashboardPage,
});

function DashboardPage() {
  const { board } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const dashboards = useQuery(dashboardsQueryOptions());
  const list = dashboards.data ?? [];
  const selectedId = board && list.some((item) => item.id === board) ? board : list[0]?.id;
  const selected = useQuery({ ...dashboardQueryOptions(selectedId ?? ''), enabled: Boolean(selectedId) });

  const [editing, setEditing] = useState(false);
  const [widgetDialog, setWidgetDialog] = useState<{ widget?: DashboardWidget } | null>(null);
  const [settings, setSettings] = useState<'new' | 'edit' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteDashboard();

  const open = (id: string | undefined) => {
    setEditing(false);
    navigate({ search: { board: id }, replace: true });
  };

  const detail = selected.data;
  useAssistantContext({
    title: detail ? `Dashboard: ${detail.name}` : 'Dashboard',
    summary: detail
      ? `Widgets: ${detail.widgets.map((widget) => `${widget.title} (${widget.type})`).join(', ') || 'none yet'}`
      : 'No dashboard selected.',
  });

  if (dashboards.isPending) {
    return (
      <PageContainer className="max-w-7xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </PageContainer>
    );
  }

  const firstName = user?.name.split(' ')[0] ?? 'there';

  if (list.length === 0) {
    return (
      <PageContainer>
        <Card className="mx-auto max-w-lg text-center">
          <CardHeader>
            <LayoutDashboard className="mx-auto size-8 text-muted-foreground" />
            <CardTitle>Welcome, {firstName}</CardTitle>
            <CardDescription>
              Build a dashboard from live views of alarms, readings, shifts and the logbook. Start from the operations
              layout and adjust it, or begin empty.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setSettings('new')}>
              <Plus />
              Create a dashboard
            </Button>
          </CardContent>
        </Card>
        <DashboardFormDialog open={settings === 'new'} onOpenChange={(value) => !value && setSettings(null)} onCreated={(created) => open(created.id)} />
      </PageContainer>
    );
  }

  const mine = list.filter((item) => item.owner.id === user?.id);
  const shared = list.filter((item) => item.owner.id !== user?.id);

  return (
    <PageContainer className="max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select value={selectedId} onValueChange={open}>
            <SelectTrigger className="w-64" aria-label="Dashboard">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <DashboardGroup label="My dashboards" items={mine} />
              <DashboardGroup label="Shared with me" items={shared} />
            </SelectContent>
          </Select>
          {detail?.isShared && (
            <Badge variant="outline" className="gap-1">
              <Share2 className="size-3" />
              Shared{detail.owner.id !== user?.id && ` by ${detail.owner.name}`}
            </Badge>
          )}
          {detail?.description && <p className="hidden truncate text-sm text-muted-foreground lg:block">{detail.description}</p>}
        </div>

        <div className="flex items-center gap-2">
          {detail?.canEdit &&
            (editing ? (
              <>
                <Button variant="outline" onClick={() => setWidgetDialog({})}>
                  <Plus />
                  Add widget
                </Button>
                <Button onClick={() => setEditing(false)}>
                  <Check />
                  Done
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                Edit layout
              </Button>
            ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Dashboard options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setSettings('new')}>New dashboard</DropdownMenuItem>
              {detail?.canEdit && (
                <>
                  <DropdownMenuItem onSelect={() => setSettings('edit')}>Rename or share</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                    Delete dashboard
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!detail ? (
        <Skeleton className="h-96" />
      ) : detail.widgets.length === 0 ? (
        <Card className="border-dashed text-center">
          <CardHeader>
            <CardTitle>This dashboard is empty</CardTitle>
            <CardDescription>Add widgets: alarm lists, charts, KPIs, the on-duty roster…</CardDescription>
          </CardHeader>
          {detail.canEdit && (
            <CardContent>
              <Button
                onClick={() => {
                  setEditing(true);
                  setWidgetDialog({});
                }}
              >
                <Plus />
                Add a widget
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <DashboardGrid dashboard={detail} editing={editing} onEditWidget={(widget) => setWidgetDialog({ widget })} />
      )}

      {detail && (
        <WidgetDialog
          dashboardId={detail.id}
          widget={widgetDialog?.widget}
          open={widgetDialog !== null}
          onOpenChange={(value) => !value && setWidgetDialog(null)}
        />
      )}
      <DashboardFormDialog
        open={settings !== null}
        onOpenChange={(value) => !value && setSettings(null)}
        dashboard={settings === 'edit' ? detail : undefined}
        onCreated={(created) => open(created.id)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${detail?.name}”?`}
        description="The dashboard and its widgets are removed. The data they showed is not affected."
        pending={remove.isPending}
        onConfirm={() =>
          detail &&
          remove.mutate(detail, {
            onSettled: () => {
              setDeleting(false);
              open(undefined);
            },
          })
        }
      />
    </PageContainer>
  );
}

function DashboardGroup({ label, items }: { label: string; items: Dashboard[] }) {
  if (items.length === 0) return null;
  return (
    <SelectGroup>
      <SelectLabel>{label}</SelectLabel>
      {items.map((item) => (
        <SelectItem key={item.id} value={item.id}>
          {item.name}
        </SelectItem>
      ))}
    </SelectGroup>
  );
}
