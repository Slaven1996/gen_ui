import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { WIDGET_HEIGHTS, WIDGET_WIDTHS, type WidgetHeight, type WidgetWidth } from '@gen-ui/shared';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { HEIGHT_LABELS, ROW_HEIGHT, WIDTH_LABELS } from '../lib/grid-metrics';
import type { DraftWidget, WidgetState } from '../types';
import { WidgetBody } from './widget-body';
import { WidgetIssueCard } from './widget-issue-card';

/**
 * A plain 12-column CSS grid: widgets flow in order, spanning their width in
 * columns and height in rows. No dense packing, so the grid always reads in
 * that order and "Move earlier/later" moves what you see; a row that doesn't
 * add up to 12 leaves a gap. The columns follow the grid's own width (a
 * container query), so it lays out the same on the Dashboard page and inside
 * a chat answer, and stacks when narrow.
 *
 * `view` shows the widgets; `edit` adds each one's move, resize, edit and
 * remove buttons, which change the list through `onChange` (the page keeps
 * it as a local copy until it is saved); `preview` is the read-only copy the
 * assistant's answer shows. A widget whose check failed (`states`) shows
 * why instead of its view, and in `edit` a click on it opens its settings.
 */
export function DashboardGrid({
  widgets,
  states,
  mode,
  onChange,
  onEditWidget,
}: {
  widgets: DraftWidget[];
  states: Map<string, WidgetState>;
  mode: 'view' | 'edit' | 'preview';
  onChange?: (widgets: DraftWidget[]) => void;
  onEditWidget?: (widget: DraftWidget) => void;
}) {
  const editing = mode === 'edit';

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= widgets.length) return;
    const ordered = [...widgets];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    onChange?.(ordered);
  };

  const resize = (widget: DraftWidget, size: { width?: WidgetWidth; height?: WidgetHeight }) =>
    onChange?.(widgets.map((item) => (item.key === widget.key ? { ...item, ...size } : item)));

  const remove = (widget: DraftWidget) => onChange?.(widgets.filter((item) => item.key !== widget.key));

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-12" style={{ gridAutoRows: `${ROW_HEIGHT}px` }}>
        {widgets.map((widget, index) => {
          const state = states.get(widget.key);
          return (
            <div
              key={widget.key}
              className={cn(
                'relative min-h-0 row-span-(--widget-height) @2xl:col-span-(--widget-width)',
                editing && 'rounded-xl outline-2 outline-offset-2 outline-dashed outline-border',
              )}
              style={{ '--widget-width': widget.width, '--widget-height': widget.height } as CSSProperties}
            >
              {!state || state.checking ? (
                <Skeleton className="h-full rounded-xl" />
              ) : state.config ? (
                <WidgetBody widget={{ ...widget, config: state.config }} editing={editing} />
              ) : (
                <WidgetIssueCard
                  title={widget.title.trim() || 'Untitled widget'}
                  reason={state.reason ?? 'This widget needs attention.'}
                  onFix={editing && onEditWidget ? () => onEditWidget(widget) : undefined}
                />
              )}
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
                      <DropdownMenuRadioGroup
                        value={String(widget.width)}
                        onValueChange={(value) => resize(widget, { width: Number(value) as WidgetWidth })}
                      >
                        {WIDGET_WIDTHS.map((width) => (
                          <DropdownMenuRadioItem key={width} value={String(width)}>
                            {WIDTH_LABELS[width]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Height</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={String(widget.height)}
                        onValueChange={(value) => resize(widget, { height: Number(value) as WidgetHeight })}
                      >
                        {WIDGET_HEIGHTS.map((height) => (
                          <DropdownMenuRadioItem key={height} value={String(height)}>
                            {HEIGHT_LABELS[height]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${widget.title}`} onClick={() => onEditWidget?.(widget)}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                    aria-label={`Remove ${widget.title}`}
                    onClick={() => remove(widget)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
