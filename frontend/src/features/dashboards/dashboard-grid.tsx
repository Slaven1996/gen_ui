import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { WIDGET_HEIGHTS, WIDGET_WIDTHS, type DashboardDetail, type DashboardWidget } from '@gen-ui/shared';
import { ErrorBoundary } from '@/components/error-boundary';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ViewCard, ViewFullPageLink } from '@/components/view-card';
import { cn } from '@/lib/utils';
import { useRemoveWidget, useUpdateLayout } from './api';
import { widgetDefinition } from './widget-registry';

/** One grid row, in px (11rem); widgets are 1–3 rows tall. */
const ROW_HEIGHT = 176;
const GAP = 16;
/** Card header and padding, subtracted to get the body's height. */
const CARD_CHROME = 76;

const WIDTH_LABELS: Record<number, string> = { 3: 'Quarter', 4: 'Third', 6: 'Half', 8: 'Two thirds', 12: 'Full width' };
const HEIGHT_LABELS: Record<number, string> = { 1: 'Short', 2: 'Standard', 3: 'Tall' };

/**
 * A plain 12-column CSS grid: widgets flow in `position` order, spanning their
 * width in columns and height in rows, with dense packing filling the gaps.
 * Editing is reordering and resizing — no free-form canvas.
 */
export function DashboardGrid({
  dashboard,
  editing,
  onEditWidget,
}: {
  dashboard: DashboardDetail;
  editing: boolean;
  onEditWidget: (widget: DashboardWidget) => void;
}) {
  const layout = useUpdateLayout(dashboard.id);
  const remove = useRemoveWidget(dashboard.id);
  const widgets = dashboard.widgets;

  const saveOrder = (ordered: DashboardWidget[]) =>
    layout.mutate({
      widgets: ordered.map((widget, position) => ({
        id: widget.id,
        position,
        width: widget.width,
        height: widget.height,
      })),
    });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= widgets.length) return;
    const ordered = [...widgets];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    saveOrder(ordered);
  };

  const resize = (widget: DashboardWidget, size: { width?: number; height?: number }) =>
    saveOrder(widgets.map((item) => (item.id === widget.id ? ({ ...item, ...size } as DashboardWidget) : item)));

  return (
    <div className="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-12" style={{ gridAutoRows: `${ROW_HEIGHT}px` }}>
      {widgets.map((widget, index) => (
        <div
          key={widget.id}
          className={cn(
            'relative min-h-0 md:col-span-(--widget-width) row-span-(--widget-height)',
            editing && 'rounded-xl outline-2 outline-offset-2 outline-dashed outline-border',
          )}
          style={{ '--widget-width': widget.width, '--widget-height': widget.height } as CSSProperties}
        >
          <WidgetBody widget={widget} editing={editing} />
          {editing && (
            <div className="absolute top-2 right-2 z-10 flex gap-0.5 rounded-md border bg-background/95 p-0.5 shadow-sm">
              <Button size="icon" variant="ghost" className="size-7" aria-label="Move earlier" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowLeft />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Move later"
                disabled={index === widgets.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowRight />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="size-7" aria-label="Resize">
                    <Maximize2 />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Width</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={String(widget.width)} onValueChange={(value) => resize(widget, { width: Number(value) })}>
                    {WIDGET_WIDTHS.map((width) => (
                      <DropdownMenuRadioItem key={width} value={String(width)}>
                        {WIDTH_LABELS[width]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Height</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={String(widget.height)} onValueChange={(value) => resize(widget, { height: Number(value) })}>
                    {WIDGET_HEIGHTS.map((height) => (
                      <DropdownMenuRadioItem key={height} value={String(height)}>
                        {HEIGHT_LABELS[height]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${widget.title}`} onClick={() => onEditWidget(widget)}>
                <Pencil />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-destructive"
                aria-label={`Remove ${widget.title}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(widget.id)}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function WidgetBody({ widget, editing }: { widget: DashboardWidget; editing: boolean }) {
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
