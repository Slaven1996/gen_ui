import type { FormToolUIPart } from '@gen-ui/shared';
import { formRendererFor } from '../lib/form-renderers';

/** A form tool's call in a text-only answer: one muted line. */
export function FormStatusLine({ part }: { part: FormToolUIPart }) {
  const renderer = formRendererFor(part);
  if (part.state === 'output-error') return <p className="text-xs text-destructive">{part.errorText}</p>;
  const outcome = part.state === 'output-available' ? part.output.outcome : undefined;
  const result =
    outcome?.status === 'saved' && part.state === 'output-available'
      ? renderer.saved(outcome, part.output)
      : outcome?.status === 'closed'
        ? 'closed without saving'
        : undefined;
  return (
    <p className="text-xs text-muted-foreground">
      {renderer.label}
      {result && ` · ${result}`}
    </p>
  );
}
