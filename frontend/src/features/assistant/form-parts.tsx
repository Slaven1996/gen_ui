import { useState, type ComponentType } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { LinkProps } from '@tanstack/react-router';
import { getStaticToolName } from 'ai';
import { CircleCheck, CircleX } from 'lucide-react';
import { toast } from 'sonner';
import {
  FORM_TITLES,
  type AlarmSeverity,
  type FormOutcomeRequest,
  type FormToolName,
  type FormToolOutput,
  type FormToolUIPart,
  type GenUITools,
} from '@gen-ui/shared';
import { InlineDialog } from '@/components/inline-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewFullPageLink } from '@/components/view-card';
import { alarmDefinitionQueryOptions } from '@/features/alarms/api';
import { DefinitionForm } from '@/features/alarms/definition-form-dialog';
import { CreateUserForm } from '@/features/users/user-form-dialog';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { ALARM_CONDITION_OPTIONS, SEVERITY } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { patchFormOutput, useChatInstance } from './chat-store';
import { ToolError, ToolSkeleton } from './tool-states';

/*
 * Generative UI for forms. A form tool's call is what Claude decided [AI]:
 * which form, pre-filled with what (and for an edit, which rule). The view
 * is fixed code [app]: the app's own form, drawn inside the answer by
 * `InlineDialog`, saving through the same REST endpoint as on its page. When
 * the user saves or closes it, the browser records that on the call
 * (PUT /ai/conversations/:id/forms/:toolCallId), and the form gives way to
 * a one-line result, also after a reload.
 */

type Input<N extends FormToolName> = GenUITools[N]['input'];
type Output<N extends FormToolName> = GenUITools[N]['output'];
type Saved<N extends FormToolName> = Extract<NonNullable<Output<N>['outcome']>, { status: 'saved' }>;

interface FormProps<N extends FormToolName> {
  input: Input<N>;
  output: Output<N>;
  /** Keeps the form's button off while the answer that opened it is still streaming. */
  disabled: boolean;
  /** The save went through: the id of the record it saved. */
  onSaved: (entityId: string) => void;
}

/** How one form tool's calls show in the chat. */
interface FormRenderer<N extends FormToolName> {
  /** Shown while Claude writes the call and the server checks it. */
  pending: string;
  /** The form's name, for a closed form and a text-only answer. */
  label: string;
  /** The form itself: the page's own form component, pre-filled from the call. */
  Form: ComponentType<FormProps<N>>;
  /** The saved result in a few words. */
  saved: (outcome: Saved<N>, output: Output<N>) => string;
  /** The page that shows the saved record, for "Open in new tab". */
  link: (outcome: Saved<N>, output: Output<N>) => Pick<LinkProps, 'to' | 'search'>;
}

// ─── Users ──────────────────────────────────────────────────────────────────

function CreateUserBody({ input, disabled, onSaved }: FormProps<'createUser'>) {
  return <CreateUserForm initial={input} disabled={disabled} onCreated={(user) => onSaved(user.id)} />;
}

// ─── Alarm rules ────────────────────────────────────────────────────────────

function CreateAlarmRuleBody({ input: { tagId, ...prefill }, disabled, onSaved }: FormProps<'createAlarmRule'>) {
  return (
    <DefinitionForm initialTagId={tagId} prefill={prefill} disabled={disabled} onSaved={(rule) => onSaved(rule.id)} />
  );
}

/**
 * The rule as it is now, loaded like any other view (not the copy Claude was
 * given), with Claude's changes over it. A rule deleted since shows why.
 */
function EditAlarmRuleBody({ input, disabled, onSaved }: FormProps<'editAlarmRule'>) {
  const rule = useQuery(alarmDefinitionQueryOptions(input.ruleId));
  if (rule.isPending) return <Skeleton className="h-72" />;
  if (rule.isError) {
    return (
      <p className="pr-6 text-sm text-destructive" role="alert">
        {getErrorMessage(rule.error)}
      </p>
    );
  }
  return (
    <DefinitionForm
      definition={rule.data}
      prefill={input.changes}
      disabled={disabled}
      onSaved={(saved) => onSaved(saved.id)}
    />
  );
}

/** "threshold 4.5 → 5, severity High → Critical", from an edit's recorded changes. */
function describeChanges(changed: Record<string, { from: unknown; to: unknown }>): string {
  const shown = (field: string, value: unknown): string => {
    if (value === null || value === '') return 'none';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (field === 'severity') return SEVERITY[value as AlarmSeverity]?.label ?? String(value);
    if (field === 'condition') {
      return ALARM_CONDITION_OPTIONS.find((option) => option.value === value)?.label ?? String(value);
    }
    return String(value);
  };
  return Object.entries(changed)
    .map(([field, { from, to }]) =>
      field === 'description'
        ? 'description updated'
        : `${field === 'isEnabled' ? 'enabled' : field} ${shown(field, from)} → ${shown(field, to)}`,
    )
    .join(', ');
}

/** The rule's name after an edit: the new one if the user renamed it. */
const editedName = (outcome: Saved<'editAlarmRule'>, output: Output<'editAlarmRule'>) =>
  typeof outcome.changed?.name?.to === 'string' ? outcome.changed.name.to : output.rule.name;

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Form tool name → how its calls render. A new form tool adds one entry,
 * wrapping the form its page's dialog already uses; TypeScript flags a form
 * tool without one.
 */
const FORM_RENDERERS: { [N in FormToolName]: FormRenderer<N> } = {
  createUser: {
    pending: 'Opening the Add user form…',
    label: FORM_TITLES.createUser,
    Form: CreateUserBody,
    saved: ({ user }) => `Added ${user.name}`,
    link: ({ user }) => ({ to: '/users', search: { search: user.email } }),
  },
  createAlarmRule: {
    pending: 'Opening the New alarm rule form…',
    label: FORM_TITLES.createAlarmRule,
    Form: CreateAlarmRuleBody,
    saved: ({ rule }) => `Created “${rule.name}” on ${rule.tag} (${rule.asset})`,
    link: ({ rule }) => ({ to: '/alarm-rules', search: { search: rule.name } }),
  },
  editAlarmRule: {
    pending: 'Opening the alarm rule…',
    label: FORM_TITLES.editAlarmRule,
    Form: EditAlarmRuleBody,
    saved: (outcome, output) =>
      outcome.changed
        ? `Saved “${editedName(outcome, output)}”: ${describeChanges(outcome.changed)}`
        : `Saved “${output.rule.name}” without changes`,
    link: (outcome, output) => ({ to: '/alarm-rules', search: { search: editedName(outcome, output) } }),
  },
};

function formRendererFor(part: FormToolUIPart): FormRenderer<FormToolName> {
  const name = getStaticToolName<Pick<GenUITools, FormToolName>>(part);
  return FORM_RENDERERS[name] as unknown as FormRenderer<FormToolName>;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/**
 * Tells the server what the user did with the form, which stores it on the
 * call, then shows the call's new output in the chat.
 */
function useRecordFormOutcome(toolCallId: string) {
  const chat = useChatInstance();
  return useMutation({
    mutationFn: async (body: FormOutcomeRequest) => {
      if (!chat) throw new Error('The chat is still loading.');
      const url = `/ai/conversations/${chat.id}/forms/${encodeURIComponent(toolCallId)}`;
      return (await http.put<FormToolOutput>(url, body)).data;
    },
    onSuccess: (output) => patchFormOutput(toolCallId, output),
    onError: (error) => toast.error(`The chat couldn't keep this form's result: ${getErrorMessage(error)}`),
  });
}

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
            onSaved={(entityId) => {
              setDone('saved');
              record.mutate({ status: 'saved', entityId });
            }}
          />
        </InlineDialog>
      );
    }
    default:
      return null;
  }
}

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

/** What became of a form, in one line where the form was. */
function FormResult({
  saved,
  text,
  link,
}: {
  saved: boolean;
  text: string;
  link?: Pick<LinkProps, 'to' | 'search'>;
}) {
  const Icon = saved ? CircleCheck : CircleX;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-4 py-3 text-sm" role="status">
      <Icon className={cn('size-4 shrink-0', saved ? 'text-primary' : 'text-muted-foreground')} />
      <span className={cn('min-w-0 flex-1', !saved && 'text-muted-foreground')}>{text}</span>
      {link && <ViewFullPageLink {...link} newTab />}
    </div>
  );
}
