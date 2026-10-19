import type { LinkProps } from '@tanstack/react-router';
import {
  WIDGET_DEFAULT_SIZE,
  WIDGET_DEFAULT_TITLES,
  type CreateDashboardToolInput,
  type DashboardDetail,
  type DashboardSource,
  type SaveDashboardInput,
  type SaveWidgetInput,
} from '@gen-ui/shared';
import type { DashboardDraft, DraftWidget, WidgetState } from '../types';

let created = 0;

/** A key for a widget added while editing; saved widgets use their id. */
export const newWidgetKey = () => `new-${(created += 1)}`;

/** "New dashboard": nothing saved until the user saves it. */
export const emptyDraft = (): DashboardDraft => ({ name: '', isShared: false, widgets: [] });

/** A saved dashboard, to edit. */
export function draftFromDetail(detail: DashboardDetail): DashboardDraft {
  return {
    id: detail.id,
    name: detail.name,
    isShared: detail.isShared,
    widgets: detail.widgets.map((widget) => ({
      key: widget.id,
      id: widget.id,
      type: widget.type,
      title: widget.title,
      width: widget.width,
      height: widget.height,
      config: { ...widget.config },
    })),
  };
}

/**
 * The dashboard the assistant put together, as the page edits it: the type's
 * title and size where the call left them out, the config as given (it may
 * still lack a tag or a figure; the page asks for them).
 */
export function draftFromToolInput(input: CreateDashboardToolInput, source?: DashboardSource): DashboardDraft {
  return {
    name: input.name?.trim() ?? '',
    isShared: input.isShared ?? false,
    source,
    widgets: input.widgets.map(
      (widget, index): DraftWidget => ({
        key: `draft-${index}`,
        type: widget.type,
        title: widget.title?.trim() || WIDGET_DEFAULT_TITLES[widget.type],
        width: widget.width ?? WIDGET_DEFAULT_SIZE[widget.type].width,
        height: widget.height ?? WIDGET_DEFAULT_SIZE[widget.type].height,
        config: { ...widget.config },
      }),
    ),
  };
}

/** `widgets` with `widget` in place of the one with its key, or added at the end. */
export const withWidget = (widgets: DraftWidget[], widget: DraftWidget): DraftWidget[] =>
  widgets.some((item) => item.key === widget.key)
    ? widgets.map((item) => (item.key === widget.key ? widget : item))
    : [...widgets, widget];

/** The request that saves the draft; every widget has passed its check (`states`). */
export function toSaveBody(draft: DashboardDraft, states: Map<string, WidgetState>): SaveDashboardInput {
  return {
    name: draft.name.trim(),
    isShared: draft.isShared,
    widgets: draft.widgets.map(
      (widget) =>
        ({
          id: widget.id,
          type: widget.type,
          title: widget.title.trim(),
          width: widget.width,
          height: widget.height,
          config: states.get(widget.key)?.config ?? widget.config,
        }) as SaveWidgetInput,
    ),
  };
}

/** Whether two copies would save the same dashboard (the widgets' keys don't count). */
export function sameDraft(a: DashboardDraft, b: DashboardDraft): boolean {
  const comparable = (draft: DashboardDraft) =>
    JSON.stringify([draft.name, draft.isShared, draft.widgets.map(({ key: _key, ...widget }) => widget)]);
  return comparable(a) === comparable(b);
}

/** The page that opens an assistant's draft: the Dashboard page, with that draft in edit mode. */
export const draftLink = (source: DashboardSource): Pick<LinkProps, 'to' | 'search'> => ({
  to: '/dashboard',
  search: { conversation: source.conversationId, toolCall: source.toolCallId },
});
