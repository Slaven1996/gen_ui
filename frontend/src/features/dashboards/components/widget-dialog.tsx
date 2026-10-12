import { useEffect, useState, type FormEvent } from 'react';
import {
  WIDGET_CONFIG_SCHEMAS,
  WIDGET_DEFAULT_SIZE,
  WIDGET_HEIGHTS,
  WIDGET_TYPES,
  WIDGET_WIDTHS,
  type CreateWidgetInput,
  type DashboardWidget,
  type WidgetType,
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
import { getErrorMessage } from '@/lib/api/errors';
import { fieldErrors } from '@/lib/form';
import { useAddWidget, useUpdateWidget } from '../api/mutations';
import { HEIGHT_LABELS, WIDTH_LABELS } from '../lib/grid-metrics';
import { WIDGETS } from '../lib/widget-registry';
import type { ConfigDraft } from '../types';
import { WidgetConfigFields } from './widget-config-fields';

/** Add a widget (pick a type, then set it up) or edit one — a widget's type is fixed once added. */
export function WidgetDialog({
  dashboardId,
  widget,
  open,
  onOpenChange,
}: {
  dashboardId: string;
  widget?: DashboardWidget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [type, setType] = useState<WidgetType | null>(widget?.type ?? null);
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState<number>(4);
  const [height, setHeight] = useState<number>(2);
  const [config, setConfig] = useState<ConfigDraft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = useAddWidget(dashboardId);
  const update = useUpdateWidget(dashboardId);
  const saving = add.isPending || update.isPending;
  const error = add.error ?? update.error;

  const choose = (next: WidgetType) => {
    setType(next);
    setTitle(WIDGETS[next].defaultTitle);
    setWidth(WIDGET_DEFAULT_SIZE[next].width);
    setHeight(WIDGET_DEFAULT_SIZE[next].height);
    setConfig({ ...WIDGETS[next].defaultConfig });
    setErrors({});
  };

  useEffect(() => {
    if (!open) return;
    add.reset();
    update.reset();
    setErrors({});
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
  }, [open, widget?.id]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!type) return;
    const parsed = WIDGET_CONFIG_SCHEMAS[type].safeParse(config);
    const next: Record<string, string> = parsed.success ? {} : fieldErrors(parsed.error);
    if (!title.trim()) next.title = 'Give the widget a title';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    const size = { width, height } as Pick<CreateWidgetInput, 'width' | 'height'>;
    const close = { onSuccess: () => onOpenChange(false) };
    if (widget) {
      update.mutate({ widgetId: widget.id, patch: { title: title.trim(), ...size, config: parsed.data as ConfigDraft } }, close);
    } else {
      add.mutate({ type, title: title.trim(), ...size, config: parsed.data } as CreateWidgetInput, close);
    }
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
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{widget ? `Edit “${widget.title}”` : `New ${WIDGETS[type].label.toLowerCase()} widget`}</DialogTitle>
              <DialogDescription>{WIDGETS[type].description}</DialogDescription>
            </DialogHeader>
            <Field id="widget-title" label="Title" error={errors.title}>
              <Input id="widget-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="widget-width" label="Width">
                <Select value={String(width)} onValueChange={(value) => setWidth(Number(value))}>
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
                <Select value={String(height)} onValueChange={(value) => setHeight(Number(value))}>
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
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {getErrorMessage(error)}
              </p>
            )}
            <DialogFooter className="sm:justify-between">
              {!widget ? (
                <Button type="button" variant="ghost" onClick={() => setType(null)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : widget ? 'Save widget' : 'Add widget'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
