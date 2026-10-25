import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ViewFullPageLink } from '@/components/view-full-page-link';
import { dashboardDraftQueryOptions, dashboardQueryOptions } from '@/features/dashboards/api/queries';
import { DashboardGrid } from '@/features/dashboards/components/dashboard-grid';
import { useWidgetStates } from '@/features/dashboards/hooks/use-widget-states';
import { draftFromDetail, draftFromToolInput, draftLink } from '@/features/dashboards/lib/draft';
import { plural } from '@/lib/format';
import type { ToolCall, ToolInput } from '../../types';

/**
 * A dashboard the assistant put together: the Dashboard page's own grid and
 * widgets, read-only, under its name and whether it was created yet. Widgets
 * that still lack a tag or a figure show what is missing instead of a view.
 * "Open in new tab" opens it on the Dashboard page as an unsaved dashboard.
 * Once saved, the card shows the dashboard saved from it as it is now (its
 * name, sharing and widgets, with what the user filled in or changed on the
 * page), and its link opens that dashboard. Both are read from the
 * dashboards, so the card follows a save, edit or delete in another tab as
 * soon as this window has focus again; deleted, it is the draft again.
 */
export function DashboardDraftBody({ input, call }: { input: ToolInput<'createDashboard'>; call: ToolCall }) {
  // The page reads the draft from the saved conversation, which has it once the answer has ended.
  const source = call.done ? { conversationId: call.conversationId, toolCallId: call.toolCallId } : undefined;
  const status = useQuery({ ...dashboardDraftQueryOptions(source?.conversationId ?? '', call.toolCallId), enabled: Boolean(source) });
  const created = status.data?.dashboard ?? undefined;
  // Always stale here too, like the status, so an edit in another tab shows on focus.
  const saved = useQuery({ ...dashboardQueryOptions(created?.id ?? ''), staleTime: 0, enabled: Boolean(created) });
  const detail = created ? saved.data : undefined;

  // Until the saved dashboard has loaded, the draft stands in for it.
  const shown = useMemo(() => (detail ? draftFromDetail(detail) : draftFromToolInput(input)), [detail, input]);
  const states = useWidgetStates(shown.widgets);

  const link = created ? { to: '/dashboard' as const, search: { board: created.id } } : source && draftLink(source);
  const incomplete = shown.widgets.filter((widget) => !states.get(widget.key)?.config && !states.get(widget.key)?.checking).length;
  const name = created ? (detail?.name ?? created.name) : shown.name || 'Untitled dashboard';

  return (
    <Card className="gap-4 py-4">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <LayoutDashboard className="size-4 text-muted-foreground" aria-hidden />
        <span className="truncate text-sm font-medium">{name}</span>
        {shown.isShared && (
          <Badge variant="outline" className="gap-1">
            <Share2 className="size-3" />
            Shared
          </Badge>
        )}
        <Badge variant={created ? 'default' : 'secondary'}>{created ? 'Created' : 'Not created yet'}</Badge>
        <span className="ml-auto">{link && <ViewFullPageLink {...link} newTab />}</span>
      </div>
      <CardContent className="space-y-3 px-4">
        {!created && (
          <p className="text-xs text-muted-foreground">
            {incomplete > 0
              ? `${plural(incomplete, 'widget')} still ${incomplete === 1 ? 'needs' : 'need'} settings. Open it to finish and save it.`
              : 'Open it to adjust and save it on the Dashboard page.'}
          </p>
        )}
        {shown.widgets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No widgets yet: add them on the Dashboard page.</p>
        ) : (
          <DashboardGrid widgets={shown.widgets} states={states} mode="preview" />
        )}
      </CardContent>
    </Card>
  );
}
