import type { DashboardWidget } from '@gen-ui/shared';
import { ErrorBoundary } from '@/components/error-boundary';
import { ViewCard } from '@/components/view-card';
import { ViewFullPageLink } from '@/components/view-full-page-link';
import { CARD_CHROME, GAP, ROW_HEIGHT } from '../lib/grid-metrics';
import { widgetDefinition } from '../lib/widget-registry';

/** One widget's view inside its card, caught by an error boundary. */
export function WidgetBody({ widget, editing }: { widget: DashboardWidget; editing: boolean }) {
  const definition = widgetDefinition(widget.type);
  const bodyHeight = widget.height * ROW_HEIGHT + (widget.height - 1) * GAP - CARD_CHROME;
  const failed = (
    <ViewCard title={widget.title}>
      <p className="text-sm text-muted-foreground">This widget could not be shown. Edit its settings, or remove it.</p>
    </ViewCard>
  );

  return (
    <ErrorBoundary fallback={failed}>
      {definition.frameless ? (
        // `as never`: the entry was looked up by this widget's own type, so its config fits.
        definition.render(widget.config as never, bodyHeight, widget.title)
      ) : (
        <ViewCard
          title={widget.title}
          action={!editing && <ViewFullPageLink {...definition.link(widget.config as never)} />}
          contentClassName="overflow-auto"
        >
          {definition.render(widget.config as never, bodyHeight, widget.title)}
        </ViewCard>
      )}
    </ErrorBoundary>
  );
}
