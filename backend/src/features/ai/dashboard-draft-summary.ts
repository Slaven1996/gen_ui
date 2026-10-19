import { requiredWidgetFields, WIDGET_CONFIG_SCHEMAS, WIDGET_DEFAULT_TITLES, type GenUITools } from '@gen-ui/shared';

type DraftInput = GenUITools['createDashboard']['input'];
type DraftOutput = GenUITools['createDashboard']['output'];
type DraftWidget = DraftInput['widgets'][number];

/**
 * The names behind the ids a widget may hold. Each throws on an id that
 * isn't in the prompt's lists, so Claude reads the error and tries again.
 */
export interface DraftLookups {
  tag: (id: string) => { name: string };
  asset: (id: string) => { name: string } | undefined;
}

/** How Claude names what a widget still lacks: "the chart still needs at least one tag". */
const MISSING_LABELS: Record<string, string> = {
  metric: 'a figure',
  tagId: 'a tag',
  tagIds: 'at least one tag',
};

const isBlank = (value: unknown) => value === undefined || (Array.isArray(value) && value.length === 0);

/**
 * What `createDashboard` hands Claude: each widget's title and type, what it
 * shows by name, and what the user still has to pick. A value the user didn't
 * give is fine (the page asks for it); one that doesn't fit the widget's type
 * (a field it doesn't take, an unknown id, a value its page doesn't accept) is
 * Claude's mistake, and throws.
 */
export function summarizeDashboardDraft(input: DraftInput, known: DraftLookups): DraftOutput {
  return {
    name: input.name?.trim() || null,
    widgets: input.widgets.map((widget, index) => summarizeWidget(widget, `Widget ${index + 1} (${widget.type})`, known)),
  };
}

function summarizeWidget(widget: DraftWidget, label: string, known: DraftLookups): DraftOutput['widgets'][number] {
  const config: NonNullable<DraftWidget['config']> = widget.config ?? {};
  const values: Record<string, unknown> = config;
  const schema = WIDGET_CONFIG_SCHEMAS[widget.type];
  const takes = Object.keys(schema.shape);

  const extra = Object.keys(values).filter((key) => values[key] !== undefined && !takes.includes(key));
  if (extra.length > 0) {
    throw new Error(
      `${label} doesn't take ${extra.join(', ')}. A ${widget.type} widget takes ${takes.join(', ') || 'no settings'}; leave the rest out.`,
    );
  }

  const tags = [config.tagId, ...(config.tagIds ?? [])].flatMap((id) => (id === undefined ? [] : [known.tag(id).name]));
  const asset = config.assetId === undefined ? undefined : known.asset(config.assetId)?.name;

  const missing = requiredWidgetFields(widget.type).filter((key) => isBlank(values[key]));
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    const wrong = parsed.error.issues.filter((issue) => !missing.includes(String(issue.path[0])));
    if (wrong.length > 0) {
      throw new Error(`${label}: ${wrong.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; ')}.`);
    }
  }

  return {
    title: widget.title?.trim() || WIDGET_DEFAULT_TITLES[widget.type],
    type: widget.type,
    shows: tags.length > 0 ? tags.join(', ') : (asset ?? null),
    missing: missing.map((key) => MISSING_LABELS[key] ?? key),
  };
}
