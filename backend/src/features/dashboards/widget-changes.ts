import type { DashboardWidget, SaveWidgetDto } from '@gen-ui/shared';

/** What saving a dashboard does to its widgets. `position` is the widget's place in the saved list. */
export interface WidgetChanges {
  create: { widget: SaveWidgetDto; position: number }[];
  update: { before: DashboardWidget; after: SaveWidgetDto; position: number }[];
  remove: DashboardWidget[];
}

/**
 * Matches the widgets being saved with those the dashboard has: one with an
 * `id` keeps and updates that widget, one without is new, and a widget left
 * out is removed. Returns why it can't, for a 400, instead of throwing.
 */
export function planWidgetChanges(existing: DashboardWidget[], next: SaveWidgetDto[]): WidgetChanges | { error: string } {
  const byId = new Map(existing.map((widget) => [widget.id, widget]));
  const kept = new Set<string>();
  const changes: WidgetChanges = { create: [], update: [], remove: [] };

  for (const [position, widget] of next.entries()) {
    if (widget.id === undefined) {
      changes.create.push({ widget, position });
      continue;
    }
    const before = byId.get(widget.id);
    if (!before) return { error: `Widget ${widget.id} isn't on this dashboard; leave its id out to add it as a new one.` };
    if (kept.has(widget.id)) return { error: `Widget “${widget.title}” is listed twice.` };
    if (before.type !== widget.type) {
      return { error: `A widget's type can't change: “${before.title}” is a ${before.type} widget.` };
    }
    kept.add(widget.id);
    changes.update.push({ before, after: widget, position });
  }

  changes.remove = existing.filter((widget) => !kept.has(widget.id));
  return changes;
}
