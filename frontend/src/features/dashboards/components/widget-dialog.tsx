import { useEffect, useState, type FormEvent } from 'react';
import {
  WIDGET_DEFAULT_SIZE,
  WIDGET_HEIGHTS,
  WIDGET_TYPES,
  WIDGET_WIDTHS,
  type WidgetHeight,
  type WidgetType,
  type WidgetWidth,
} from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWidgetStates } from '../hooks/use-widget-states';
import { newWidgetKey } from '../lib/draft';
import { HEIGHT_LABELS, WIDTH_LABELS } from '../lib/grid-metrics';
import { WIDGETS } from '../lib/widget-registry';
import type { ConfigDraft, DraftWidget } from '../types';
import { WidgetConfigFields } from './widget-config-fields';

const CHECKED = 'dialog';

/**
 * Add a widget (pick a type, then set it up) or edit one; a widget's type is
 * fixed once added. It changes only the dashboard being edited, which is
 * saved as a whole. A widget can't be added or changed while its settings
 * are incomplete; `initialErrors` marks what is wrong with one that came in
 * incomplete (from the assistant) or whose tag was deleted since.
 */
export function WidgetDialog({
  widget,
  initialErrors,
  open,
  onOpenChange,
  onSubmit,
}: {
  widget?: DraftWidget;
  initialErrors?: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (widget: DraftWidget) => void;
}) {
  const [type, setType] = useState<WidgetType | null>(widget?.type ?? null);
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState<WidgetWidth>(4);
  const [height, setHeight] = useState<WidgetHeight>(2);
  const [config, setConfig] = useState<ConfigDraft>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const state = useWidgetStates(type ? [{ key: CHECKED, type, title, config }] : []).get(CHECKED);
  const errors: Record<string, string> = {};
  for (const field of flagged) {
    const message = state?.errors[field];
    if (message) errors[field] = message;
  }

  const choose = (next: WidgetType) => {
    setType(next);
    setTitle(WIDGETS[next].defaultTitle);
    setWidth(WIDGET_DEFAULT_SIZE[next].width);
    setHeight(WIDGET_DEFAULT_SIZE[next].height);
    setConfig({ ...WIDGETS[next].defaultConfig });
    setFlagged([]);
  };

  useEffect(() => {
    if (!open) return;
    setFlagged(Object.keys(initialErrors ?? {}));
    if (widget) {
      setType(widget.type);
      setTitle(widget.title);
      setWidth(widget.width);
      setHeight(widget.height);
      setConfig({ ...widget.config });
    } else {
      setType(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened.
  }, [open, widget?.key]);

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!type || !state || state.checking) return;
    if (!state.config) {
      setFlagged(Object.keys(state.errors));
      return;
    }
    onSubmit({
      key: widget?.key ?? newWidgetKey(),
      id: widget?.id,
      type,
      title: title.trim(),
      width,
      height,
      config: { ...state.config },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {!type ? (
          <>
            <DialogHeader>
              <DialogTitle>Add a widget</DialogTitle>
              <DialogDescription>Each widget is a live view of one of the app’s pages, filtered the way you set it.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              {WIDGET_TYPES.map((option) => {
                const { icon: Icon, label, description } = WIDGETS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => choose(option)}
                    className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <form onSubmit={onFormSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{widget ? `Edit “${widget.title}”` : `New ${WIDGETS[type].label.toLowerCase()} widget`}</DialogTitle>
              <DialogDescription>{WIDGETS[type].description}</DialogDescription>
            </DialogHeader>
            <Field id="widget-title" label="Title" error={errors.title}>
              <Input id="widget-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="widget-width" label="Width">
                <Select value={String(width)} onValueChange={(value) => setWidth(Number(value) as WidgetWidth)}>
                  <SelectTrigger id="widget-width" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WIDGET_WIDTHS.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {WIDTH_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="widget-height" label="Height">
                <Select value={String(height)} onValueChange={(value) => setHeight(Number(value) as WidgetHeight)}>
                  <SelectTrigger id="widget-height" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WIDGET_HEIGHTS.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {HEIGHT_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <WidgetConfigFields type={type} config={config} onChange={setConfig} errors={errors} />
            <DialogFooter className="sm:justify-between">
              {!widget ? (
                <Button type="button" variant="ghost" onClick={() => setType(null)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={!state || state.checking}>
                {widget ? 'Apply' : 'Add widget'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
