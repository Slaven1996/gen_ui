import { useState } from 'react';
import type { FormToolUIPart } from '@gen-ui/shared';
import { InlineDialog } from '@/components/inline-dialog';
import { useRecordFormOutcome } from '../hooks/use-record-form-outcome';
import { formRendererFor } from '../lib/form-renderers';
import { FormResult } from './form-result';
import { ToolError } from './tool-error';
import { ToolSkeleton } from './tool-skeleton';

/**
 * A form tool's call: a skeleton while it is written, then the form inside
 * the answer, then, once saved or closed, a one-line result.
 * `streaming`: the answer that holds the call is still arriving.
 */
export function FormPartView({ part, streaming }: { part: FormToolUIPart; streaming: boolean }) {
  const renderer = formRendererFor(part);
  // What the user just did, shown until the recorded outcome arrives.
  const [done, setDone] = useState<'saved' | 'closed'>();
  const record = useRecordFormOutcome(part.toolCallId);

  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return <ToolSkeleton label={renderer.pending} />;
    case 'output-error':
      return <ToolError title="The form didn't open" message={part.errorText} />;
    case 'output-available': {
      const outcome = part.output.outcome ?? record.data?.outcome;
      if (outcome?.status === 'saved') {
        return (
          <FormResult
            saved
            text={renderer.saved(outcome, part.output)}
            link={renderer.link(outcome, part.output)}
          />
        );
      }
      if (outcome?.status === 'closed' || done === 'closed') {
        return <FormResult saved={false} text={`${renderer.label}: closed without saving`} />;
      }
      if (done === 'saved') return <FormResult saved text="Saved" />;

      const { Form } = renderer;
      return (
        <InlineDialog
          onClose={() => {
            setDone('closed');
            record.mutate({ status: 'closed' });
          }}
        >
          <Form
            input={part.input}
            output={part.output}
            disabled={streaming}
            onSaved={(entityId, entityIds) => {
              setDone('saved');
              record.mutate({ status: 'saved', entityId, entityIds });
            }}
          />
        </InlineDialog>
      );
    }
    default:
      return null;
  }
}
