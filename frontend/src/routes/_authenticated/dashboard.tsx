import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Dashboard, DashboardSource } from '@gen-ui/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageContainer } from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateDashboard, useDeleteDashboard, useSaveDashboard } from '@/features/dashboards/api/mutations';
import {
  dashboardDraftQueryOptions,
  dashboardKeys,
  dashboardQueryOptions,
  dashboardsQueryOptions,
} from '@/features/dashboards/api/queries';
import { DashboardEditHeader } from '@/features/dashboards/components/dashboard-edit-header';
import { DashboardGrid } from '@/features/dashboards/components/dashboard-grid';
import { DashboardHeader } from '@/features/dashboards/components/dashboard-header';
import { DashboardWelcome } from '@/features/dashboards/components/dashboard-welcome';
import { DraftCreatedNotice } from '@/features/dashboards/components/draft-created-notice';
import { DraftUnavailable } from '@/features/dashboards/components/draft-unavailable';
import { EmptyDashboard } from '@/features/dashboards/components/empty-dashboard';
import { WidgetDialog } from '@/features/dashboards/components/widget-dialog';
import { useDashboardEditor } from '@/features/dashboards/hooks/use-dashboard-editor';
import { useWidgetStates } from '@/features/dashboards/hooks/use-widget-states';
import { draftFromDetail, draftFromToolInput, emptyDraft, toSaveBody, withWidget } from '@/features/dashboards/lib/draft';
import type { DraftWidget } from '@/features/dashboards/types';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { getErrorMessage, getErrorStatus } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';
import { plural } from '@/lib/format';
import { searchSchema } from '@/lib/search';

/**
 * `board`: which dashboard is open; without it, the first of your own.
 * `conversationId` + `toolCallId`: a dashboard the assistant put together in
 * that conversation, opened unsaved in edit mode.
 */
const dashboardSearch = z.object({
  board: z.guid().optional(),
  conversationId: z.uuid().optional(),
  toolCallId: z.string().min(1).max(200).optional(),
});

/** `board` if it is one you can see, else the first in the list (your own come first). */
const openDashboardId = (list: Dashboard[], board: string | undefined) =>
  board && list.some((item) => item.id === board) ? board : list[0]?.id;

export const Route = createFileRoute('/_authenticated/dashboard')({
  staticData: { title: 'Dashboard' },
  validateSearch: searchSchema(dashboardSearch),
  loaderDeps: ({ search }) => ({
    board: search.board,
    conversationId: search.conversationId,
    toolCallId: search.toolCallId,
  }),
  // The open dashboard needs the list to resolve, so its widgets load right after it, before the page renders.
  loader: async ({ context, deps }) => {
    if (deps.conversationId && deps.toolCallId) {
      // A draft already saved (an old tab, the browser history) opens the dashboard saved from it.
      const draft = await context.queryClient
        .ensureQueryData(dashboardDraftQueryOptions(deps.conversationId, deps.toolCallId))
        .catch(() => undefined);
      if (draft?.dashboard) throw redirect({ to: '/dashboard', search: { board: draft.dashboard.id }, replace: true });
    }
    const list = await context.queryClient.ensureQueryData(dashboardsQueryOptions());
    const id = openDashboardId(list, deps.board);
    if (id) await context.queryClient.ensureQueryData(dashboardQueryOptions(id));
  },
  component: DashboardPage,
});

/**
 * Viewing shows the open dashboard. Editing works on a local copy of the
 * whole dashboard (name, sharing, widgets with their order and sizes), saved
 * in one request; Cancel drops it. A new dashboard, and one the assistant put
 * together, are such copies from the start: nothing is on the server until
 * they are saved.
 */
function DashboardPage() {
  const { board, conversationId, toolCallId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const dashboards = useQuery(dashboardsQueryOptions());
  const list = dashboards.data ?? [];
  const selectedId = openDashboardId(list, board);
  const selected = useQuery({ ...dashboardQueryOptions(selectedId ?? ''), enabled: Boolean(selectedId) });
  const detail = selected.data;

  const source: DashboardSource | undefined = conversationId && toolCallId ? { conversationId, toolCallId } : undefined;
  const fromChat = useQuery({
    ...dashboardDraftQueryOptions(conversationId ?? '', toolCallId ?? ''),
    enabled: Boolean(source),
  });

  const editor = useDashboardEditor();
  const draft = editor.draft;
  const [widgetDialog, setWidgetDialog] = useState<{ widget?: DraftWidget; errors?: Record<string, string> } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const create = useCreateDashboard();
  const save = useSaveDashboard();
  const remove = useDeleteDashboard();

  // The assistant's draft opens in edit mode, once per link.
  const [openedDraft, setOpenedDraft] = useState<string>();
  const draftKey = source && `${source.conversationId}/${source.toolCallId}`;
  if (draftKey && draftKey !== openedDraft && fromChat.data && !fromChat.data.dashboard) {
    setOpenedDraft(draftKey);
    editor.start(draftFromToolInput(fromChat.data.draft, source));
  }
  // Left the link (Cancel, Save): coming back to it (Back) opens the draft again.
  if (!draftKey && openedDraft) setOpenedDraft(undefined);

  const viewWidgets = useMemo(() => (detail ? draftFromDetail(detail).widgets : []), [detail]);
  const states = useWidgetStates(draft?.widgets ?? viewWidgets);
  // Saved meanwhile from another tab (not by this page's own save, which leaves edit mode).
  const createdElsewhere =
    draft?.source && !create.isPending && !create.isSuccess ? (fromChat.data?.dashboard ?? undefined) : undefined;
  const leave = useUnsavedChanges(editor.dirty && !createdElsewhere, 'the changes to this dashboard');

  const invalid = draft ? draft.widgets.filter((widget) => !states.get(widget.key)?.config).length : 0;
  const checking = draft ? draft.widgets.some((widget) => states.get(widget.key)?.checking) : false;
  const attention =
    [
      draft && !draft.name.trim() && 'Name the dashboard',
      invalid > 0 && `${plural(invalid, 'widget')} ${invalid === 1 ? 'needs' : 'need'} attention`,
      checking && 'Checking the widgets…',
      createdElsewhere && 'Already created',
    ]
      .filter(Boolean)
      .join(' · ') || undefined;

  const open = (id: string | undefined) => navigate({ search: { board: id }, replace: true });

  /** Leaves edit mode, then opens `board` (the one just saved), or the page without a draft. */
  const finish = (savedId?: string) => {
    leave.release();
    editor.stop();
    if (savedId) void navigate({ search: { board: savedId }, replace: true });
    else if (source) void navigate({ search: {}, replace: true });
  };

  const onSave = () => {
    if (!draft || attention) return;
    const body = toSaveBody(draft, states);
    const onError = (error: unknown) => {
      // One draft makes one dashboard: it was saved meanwhile, and the notice says where.
      if (draft.source && getErrorStatus(error) === 409) {
        void queryClient.invalidateQueries({
          queryKey: dashboardKeys.draft(draft.source.conversationId, draft.source.toolCallId),
        });
        return;
      }
      toast.error(getErrorMessage(error));
    };
    if (draft.id) save.mutate({ id: draft.id, body }, { onSuccess: (saved) => finish(saved.id), onError });
    else create.mutate({ ...body, source: draft.source }, { onSuccess: (created) => finish(created.id), onError });
  };

  if (dashboards.isPending || (source && fromChat.isPending && !draft)) {
    return (
      <PageContainer className="max-w-7xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </PageContainer>
    );
  }

  if (draft) {
    return (
      <PageContainer className="max-w-7xl">
        {createdElsewhere && <DraftCreatedNotice dashboard={createdElsewhere} />}
        <DashboardEditHeader
          draft={draft}
          attention={attention}
          saving={create.isPending || save.isPending}
          onChange={editor.change}
          onAddWidget={() => setWidgetDialog({})}
          onCancel={() => finish()}
          onSave={onSave}
        />
        {draft.widgets.length === 0 ? (
          <EmptyDashboard onAdd={() => setWidgetDialog({})} />
        ) : (
          <DashboardGrid
            widgets={draft.widgets}
            states={states}
            mode="edit"
            onChange={(widgets) => editor.change({ widgets })}
            onEditWidget={(widget) => setWidgetDialog({ widget, errors: states.get(widget.key)?.errors })}
          />
        )}
        <WidgetDialog
          widget={widgetDialog?.widget}
          initialErrors={widgetDialog?.errors}
          open={widgetDialog !== null}
          onOpenChange={(value) => !value && setWidgetDialog(null)}
          onSubmit={(widget) => editor.change({ widgets: withWidget(draft.widgets, widget) })}
        />
        {leave.dialog}
      </PageContainer>
    );
  }

  const startNew = () => editor.start(emptyDraft());

  if (source && fromChat.isError) {
    return (
      <PageContainer>
        <DraftUnavailable
          onOpenDashboards={() => void navigate({ search: {}, replace: true })}
          onNew={() => {
            void navigate({ search: {}, replace: true });
            startNew();
          }}
        />
      </PageContainer>
    );
  }

  if (list.length === 0) {
    return (
      <PageContainer>
        <DashboardWelcome firstName={user?.name.split(' ')[0] ?? 'there'} onCreate={startNew} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-7xl">
      <DashboardHeader
        dashboards={list}
        userId={user?.id}
        selected={detail ?? list.find((item) => item.id === selectedId)}
        onOpen={open}
        onEdit={() => detail && editor.start(draftFromDetail(detail))}
        onNew={startNew}
        onDelete={() => setDeleting(true)}
      />

      {!detail ? (
        <Skeleton className="h-96" />
      ) : detail.widgets.length === 0 ? (
        <EmptyDashboard
          onAdd={
            detail.canEdit
              ? () => {
                  editor.start(draftFromDetail(detail));
                  setWidgetDialog({});
                }
              : undefined
          }
        />
      ) : (
        <DashboardGrid widgets={viewWidgets} states={states} mode="view" />
      )}

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
