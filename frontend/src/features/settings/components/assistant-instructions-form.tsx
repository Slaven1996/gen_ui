import { useState, type FormEvent } from 'react';
import {
  MAX_ASSISTANT_INSTRUCTIONS_LENGTH,
  UpdateAssistantInstructionsSchema,
  type AssistantInstructions,
} from '@gen-ui/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { getErrorMessage } from '@/lib/api/errors';
import { formatDateTime, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSaveAssistantInstructions } from '../api/mutations';

/**
 * Edits the assistant's standing instructions. The page keys it by the saved
 * version, so after a save it starts again from the saved text.
 */
export function AssistantInstructionsForm({ instructions }: { instructions: AssistantInstructions }) {
  const [content, setContent] = useState(instructions.content);
  const [error, setError] = useState<string>();
  const save = useSaveAssistantInstructions();

  const length = content.trim().length;
  const dirty = content.trim() !== instructions.content;
  const leave = useUnsavedChanges(dirty, 'your changes to the instructions');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = UpdateAssistantInstructionsSchema.safeParse({ content });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    save.mutate(parsed.data);
  };

  const fill = (text: string) => {
    setContent(text);
    setError(undefined);
  };

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Assistant instructions</CardTitle>
            <CardDescription>
              The standing instructions every chat starts with. After them the app adds, on its own, the answer
              format, the forms the user may open, the lists of assets, people, devices, tags and alarm rules, and
              the user's name and clock. Changes apply to the next message anyone sends.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              aria-label="Assistant instructions"
              value={content}
              onChange={(event) => fill(event.target.value)}
              spellCheck={false}
              aria-invalid={Boolean(error)}
              className="field-sizing-fixed h-[60vh] resize-y font-mono text-sm md:text-sm"
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {instructions.isDefault
                  ? 'The built-in instructions: nobody has changed them yet.'
                  : `Last saved ${formatDateTime(instructions.updatedAt)}${instructions.updatedBy ? ` by ${instructions.updatedBy.name}` : ''}.`}
              </span>
              <span className={cn('tabular-nums', length > MAX_ASSISTANT_INSTRUCTIONS_LENGTH && 'text-destructive')}>
                {formatNumber(length, 0)} / {formatNumber(MAX_ASSISTANT_INSTRUCTIONS_LENGTH, 0)}
              </span>
            </div>
            {(error || save.isError) && (
              <p className="text-sm text-destructive" role="alert">
                {error ?? getErrorMessage(save.error)}
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fill(instructions.defaultContent)}
              disabled={content.trim() === instructions.defaultContent}
            >
              Restore default
            </Button>
            <div className="flex gap-2">
              {dirty && (
                <Button type="button" variant="ghost" onClick={() => fill(instructions.content)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={!dirty || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
      {leave.dialog}
    </>
  );
}
