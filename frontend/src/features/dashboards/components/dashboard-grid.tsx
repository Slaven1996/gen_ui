import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { WIDGET_HEIGHTS, WIDGET_WIDTHS, type DashboardDetail, type DashboardWidget } from '@gen-ui/shared';
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
import { cn } from '@/lib/utils';
import { useRemoveWidget, useUpdateLayout } from '../api/mutations';
import { HEIGHT_LABELS, ROW_HEIGHT, WIDTH_LABELS } from '../lib/grid-metrics';
import { WidgetBody } from './widget-body';

/**
 * A plain 12-column CSS grid: widgets flow in `position` order, spanning their
 * width in columns and height in rows. No dense packing, so the grid always
 * reads in that order and "Move earlier/later" moves what you see; a row that
 * doesn't add up to 12 leaves a gap. Editing is reordering and resizing — no
 * free-form canvas.
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12" style={{ gridAutoRows: `${ROW_HEIGHT}px` }}>
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
