import { useState, type ComponentType, type ReactNode } from 'react';
import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { LinkProps } from '@tanstack/react-router';
import { getStaticToolName } from 'ai';
import { CircleCheck, CircleX } from 'lucide-react';
import { toast } from 'sonner';
import {
  FORM_TITLES,
  templateTimes,
  zonedDate,
  type AlarmSeverity,
  type AssetType,
  type DeviceProtocol,
  type DeviceStatus,
  type FormOutcomeRequest,
  type FormToolName,
  type FormToolOutput,
  type FormToolUIPart,
  type GenUITools,
  type LogbookCategory,
  type LogSeverity,
  type ShiftChangeResult,
  type ShiftRole,
  type TagDataType,
} from '@gen-ui/shared';
import { InlineDialog } from '@/components/inline-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewFullPageLink } from '@/components/view-card';
import { alarmDefinitionQueryOptions } from '@/features/alarms/api';
import { DefinitionForm } from '@/features/alarms/definition-form-dialog';
import { assetQueryOptions, deviceQueryOptions, tagQueryOptions } from '@/features/assets/api';
import { AssetForm } from '@/features/assets/asset-form-dialog';
import { DeviceForm } from '@/features/devices/device-form-dialog';
import { logbookEntryQueryOptions } from '@/features/logbook/api';
import { EntryForm } from '@/features/logbook/entry-form-dialog';
import { shiftAssignmentQueryOptions, shiftTemplatesQueryOptions } from '@/features/shifts/api';
import { CopyWeekForm } from '@/features/shifts/copy-week-dialog';
import { EditShiftForm } from '@/features/shifts/edit-shift-dialog';
import { ScheduleShiftForm } from '@/features/shifts/schedule-shift-dialog';
import { TemplateForm } from '@/features/shifts/template-form';
import { TagForm } from '@/features/tags/tag-form-dialog';
import { CreateUserForm } from '@/features/users/user-form-dialog';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { formatDateTime } from '@/lib/format';
import {
  ALARM_CONDITION_OPTIONS,
  ASSET_TYPE,
  DEVICE_PROTOCOL,
  DEVICE_STATUS,
  LOG_SEVERITY,
  LOGBOOK_CATEGORY,
  SEVERITY,
  SHIFT_ROLE,
  TAG_DATA_TYPE,
} from '@/lib/labels';
import { cn } from '@/lib/utils';
import { patchFormOutput, useChatInstance } from './chat-store';
import { ToolError, ToolSkeleton } from './tool-states';

/*
 * Generative UI for forms. A form tool's call is what Claude decided [AI]:
 * which form, pre-filled with what (and for an edit, which record). The view
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
  /**
   * The save went through: the id of the record it saved, and for a form
   * that saves several (a repeating shift, a copied week), every one.
   */
  onSaved: (entityId: string, entityIds?: string[]) => void;
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

// ─── Edits ──────────────────────────────────────────────────────────────────

/**
 * The record an edit form opens on, loaded like any other view (not the copy
 * Claude was given): a skeleton until it arrives, or why it can't open (e.g.
 * deleted since).
 */
function WhenLoaded<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Skeleton className="h-72" />;
  if (query.isError) {
    return (
      <p className="pr-6 text-sm text-destructive" role="alert">
        {getErrorMessage(query.error)}
      </p>
    );
  }
  return children(query.data);
}

type Changes = Record<string, { from: unknown; to: unknown }>;

/**
 * How a changed field reads in an edit's result line: its label (default:
 * the field's name) and its values (`null`: just say it changed, for long text).
 */
type ChangeLabels = Record<string, { label?: string; show?: ((value: unknown) => string) | null }>;

const shownValue = (value: unknown): string => {
  if (value === null || value === '') return 'none';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return String(value);
};

/** A value shown by its label: HIGH → High. */
const byLabel = (label: (value: string) => string | undefined) => (value: unknown) =>
  (typeof value === 'string' && label(value)) || shownValue(value);

/** "threshold 4.5 → 5, severity High → Critical", from an edit's recorded changes. */
function describeChanges(changed: Changes, labels: ChangeLabels): string {
  return Object.entries(changed)
    .map(([field, { from, to }]) => {
      const { label = field, show = shownValue } = labels[field] ?? {};
      return show === null ? `${label} updated` : `${label} ${show(from)} → ${show(to)}`;
    })
    .join(', ');
}

/** A text value after an edit: the new one if the user changed it (e.g. renamed the record). */
function afterEdit(changed: Changes | null, field: string, before: string): string {
  const to = changed?.[field]?.to;
  return typeof to === 'string' ? to : before;
}

/**
 * "Saved “PS-01 RTU”: status Online → Maintenance", or "Saved “PS-01 RTU”
 * without changes". `nameField`: the field `name` comes from, in case the
 * user changed it.
 */
function savedEdit(changed: Changes | null, name: string, labels: ChangeLabels, nameField = 'name'): string {
  return changed
    ? `Saved “${afterEdit(changed, nameField, name)}”: ${describeChanges(changed, labels)}`
    : `Saved “${name}” without changes`;
}

// ─── Alarm rules ────────────────────────────────────────────────────────────

function CreateAlarmRuleBody({ input: { tagId, ...prefill }, disabled, onSaved }: FormProps<'createAlarmRule'>) {
  return (
    <DefinitionForm initialTagId={tagId} prefill={prefill} disabled={disabled} onSaved={(rule) => onSaved(rule.id)} />
  );
}

/** The rule as it is now, with Claude's changes over it. */
function EditAlarmRuleBody({ input, disabled, onSaved }: FormProps<'editAlarmRule'>) {
  const rule = useQuery(alarmDefinitionQueryOptions(input.ruleId));
  return (
    <WhenLoaded query={rule}>
      {(definition) => (
        <DefinitionForm
          definition={definition}
          prefill={input.changes}
          disabled={disabled}
          onSaved={(saved) => onSaved(saved.id)}
        />
      )}
    </WhenLoaded>
  );
}

const RULE_CHANGES: ChangeLabels = {
  description: { show: null },
  isEnabled: { label: 'enabled' },
  severity: { show: byLabel((value) => SEVERITY[value as AlarmSeverity]?.label) },
  condition: { show: byLabel((value) => ALARM_CONDITION_OPTIONS.find((option) => option.value === value)?.label) },
};

// ─── Devices ────────────────────────────────────────────────────────────────

function CreateDeviceBody({ input, disabled, onSaved }: FormProps<'createDevice'>) {
  return <DeviceForm prefill={input} disabled={disabled} onSaved={(device) => onSaved(device.id)} />;
}

/** The device as it is now, with Claude's changes over it. */
function EditDeviceBody({ input, disabled, onSaved }: FormProps<'editDevice'>) {
  const device = useQuery(deviceQueryOptions(input.deviceId));
  return (
    <WhenLoaded query={device}>
      {(current) => (
        <DeviceForm device={current} prefill={input.changes} disabled={disabled} onSaved={(saved) => onSaved(saved.id)} />
      )}
    </WhenLoaded>
  );
}

const DEVICE_CHANGES: ChangeLabels = {
  serialNumber: { label: 'serial number' },
  asset: { label: 'installed on' },
  status: { show: byLabel((value) => DEVICE_STATUS[value as DeviceStatus]?.label) },
  protocol: { show: byLabel((value) => DEVICE_PROTOCOL[value as DeviceProtocol]) },
  firmwareVersion: { label: 'firmware' },
  ipAddress: { label: 'IP address' },
  installedAt: { label: 'installed' },
};

// ─── Tags ───────────────────────────────────────────────────────────────────

function CreateTagBody({ input: { deviceId, ...prefill }, disabled, onSaved }: FormProps<'createTag'>) {
  return <TagForm deviceId={deviceId} prefill={prefill} disabled={disabled} onSaved={(tag) => onSaved(tag.id)} />;
}

/** The tag as it is now, with Claude's changes over it. */
function EditTagBody({ input, disabled, onSaved }: FormProps<'editTag'>) {
  const tag = useQuery(tagQueryOptions(input.tagId));
  return (
    <WhenLoaded query={tag}>
      {(current) => (
        <TagForm tag={current} prefill={input.changes} disabled={disabled} onSaved={(saved) => onSaved(saved.id)} />
      )}
    </WhenLoaded>
  );
}

const TAG_CHANGES: ChangeLabels = {
  description: { show: null },
  dataType: { label: 'type', show: byLabel((value) => TAG_DATA_TYPE[value as TagDataType]) },
  minValue: { label: 'range minimum' },
  maxValue: { label: 'range maximum' },
  logIntervalSeconds: {
    label: 'log interval',
    show: (value) => (typeof value === 'number' ? `${value} s` : shownValue(value)),
  },
  isActive: { label: 'active' },
};

// ─── Assets ─────────────────────────────────────────────────────────────────

/** The parent goes in as where the asset goes, which also picks its starting type. */
function CreateAssetBody({ input: { parentId, ...prefill }, disabled, onSaved }: FormProps<'createAsset'>) {
  return (
    <AssetForm
      parentId={parentId ?? undefined}
      prefill={prefill}
      disabled={disabled}
      onSaved={(asset) => onSaved(asset.id)}
    />
  );
}

/** The asset as it is now, with Claude's changes over it. */
function EditAssetBody({ input, disabled, onSaved }: FormProps<'editAsset'>) {
  const asset = useQuery(assetQueryOptions(input.assetId));
  return (
    <WhenLoaded query={asset}>
      {(current) => (
        <AssetForm asset={current} prefill={input.changes} disabled={disabled} onSaved={(saved) => onSaved(saved.id)} />
      )}
    </WhenLoaded>
  );
}

const ASSET_CHANGES: ChangeLabels = {
  type: { show: byLabel((value) => ASSET_TYPE[value as AssetType]?.label) },
  parent: { show: (value) => (value === null ? 'top level' : shownValue(value)) },
  description: { show: null },
  isActive: { label: 'in service' },
};

// ─── Logbook ────────────────────────────────────────────────────────────────

function CreateLogbookEntryBody({ input, disabled, onSaved }: FormProps<'createLogbookEntry'>) {
  return <EntryForm prefill={input} disabled={disabled} onSaved={(entry) => onSaved(entry.id)} />;
}

/** The entry as it is now, with Claude's changes over it. */
function EditLogbookEntryBody({ input, disabled, onSaved }: FormProps<'editLogbookEntry'>) {
  const entry = useQuery(logbookEntryQueryOptions(input.entryId));
  return (
    <WhenLoaded query={entry}>
      {(current) => (
        <EntryForm entry={current} prefill={input.changes} disabled={disabled} onSaved={(saved) => onSaved(saved.id)} />
      )}
    </WhenLoaded>
  );
}

const categoryLabel = (category: LogbookCategory) => LOGBOOK_CATEGORY[category].label.toLowerCase();

const ENTRY_CHANGES: ChangeLabels = {
  category: { label: 'type', show: byLabel((value) => LOGBOOK_CATEGORY[value as LogbookCategory]?.label) },
  severity: { show: byLabel((value) => LOG_SEVERITY[value as LogSeverity]?.label) },
  body: { label: 'details', show: null },
  occurredAt: { label: 'time', show: (value) => (typeof value === 'string' ? formatDateTime(value) : shownValue(value)) },
};

// ─── Shifts ─────────────────────────────────────────────────────────────────

/** What a shift save reports: the first shift, and every one (a repeat or a copy saves several). */
const reportShifts = (onSaved: FormProps<FormToolName>['onSaved']) => ({ items }: ShiftChangeResult) =>
  onSaved(items[0].id, items.map((item) => item.id));

/** Dates and times are the plant's, as on the Shifts page: `output.timeZone`. */
function ScheduleShiftBody({ input, output, disabled, onSaved }: FormProps<'scheduleShift'>) {
  return (
    <ScheduleShiftForm
      prefill={input}
      date={zonedDate(new Date(), output.timeZone)}
      timeZone={output.timeZone}
      disabled={disabled}
      onSaved={reportShifts(onSaved)}
    />
  );
}

/**
 * The shift as it is now, with Claude's changes over it. It waits for the
 * templates too, so a change to another shift brings that shift's hours.
 */
function EditShiftBody({ input, output, disabled, onSaved }: FormProps<'editShift'>) {
  const shift = useQuery(shiftAssignmentQueryOptions(output.shiftId));
  const templates = useQuery(shiftTemplatesQueryOptions());
  return (
    <WhenLoaded query={shift}>
      {(current) => (
        <WhenLoaded query={templates}>
          {() => (
            <EditShiftForm
              shift={current}
              timeZone={output.timeZone}
              prefill={input.changes}
              initialScope={output.scope}
              disabled={disabled}
              // A change to the rest of a series may leave this shift (already started) as it was.
              onSaved={({ items }) => onSaved(output.shiftId, items.map((item) => item.id))}
            />
          )}
        </WhenLoaded>
      )}
    </WhenLoaded>
  );
}

function CopyShiftWeekBody({ input, output, disabled, onSaved }: FormProps<'copyShiftWeek'>) {
  return (
    <CopyWeekForm
      week={output.week}
      filters={{ userId: input.userId, templateId: input.templateId }}
      weeks={input.weeks}
      disabled={disabled}
      onSaved={reportShifts(onSaved)}
    />
  );
}

function CreateShiftTemplateBody({ input, disabled, onSaved }: FormProps<'createShiftTemplate'>) {
  return <TemplateForm prefill={input} heading="dialog" disabled={disabled} onSaved={(template) => onSaved(template.id)} />;
}

/** The template as it is now, from the list the Shifts page keeps, with Claude's changes over it. */
function EditShiftTemplateBody({ input, disabled, onSaved }: FormProps<'editShiftTemplate'>) {
  const template = useQuery({
    ...shiftTemplatesQueryOptions(),
    select: (templates) => templates.find((item) => item.id === input.templateId) ?? null,
  });
  return (
    <WhenLoaded query={template}>
      {(current) =>
        current ? (
          <TemplateForm
            template={current}
            prefill={input.changes}
            heading="dialog"
            disabled={disabled}
            onSaved={(saved) => onSaved(saved.id)}
          />
        ) : (
          <p className="pr-6 text-sm text-destructive" role="alert">
            This shift template no longer exists.
          </p>
        )
      }
    </WhenLoaded>
  );
}

const hoursShown = (value: unknown) => (typeof value === 'number' ? `${value} h` : shownValue(value));

const SHIFT_CHANGES: ChangeLabels = {
  role: { show: byLabel((value) => SHIFT_ROLE[value as ShiftRole]) },
  hours: { show: hoursShown },
  notes: { show: null },
};

const TEMPLATE_CHANGES: ChangeLabels = {
  startTime: { label: 'start' },
  durationMinutes: { label: 'length', show: (value) => (typeof value === 'number' ? hoursShown(value / 60) : shownValue(value)) },
  color: { label: 'colour' },
  isActive: { label: 'active' },
  coverage: { label: 'staffing', show: null },
};

const shiftCount = (count: number) => `${count} ${count === 1 ? 'shift' : 'shifts'}`;

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
    saved: ({ changed }, { rule }) => savedEdit(changed, rule.name, RULE_CHANGES),
    link: ({ changed }, { rule }) => ({ to: '/alarm-rules', search: { search: afterEdit(changed, 'name', rule.name) } }),
  },
  createDevice: {
    pending: 'Opening the Register a device form…',
    label: FORM_TITLES.createDevice,
    Form: CreateDeviceBody,
    saved: ({ device }) => `Registered ${device.name} (${device.serialNumber}) on ${device.asset}`,
    link: ({ device }) => ({ to: '/devices', search: { search: device.serialNumber } }),
  },
  editDevice: {
    pending: 'Opening the device…',
    label: FORM_TITLES.editDevice,
    Form: EditDeviceBody,
    saved: ({ changed }, { device }) => savedEdit(changed, device.name, DEVICE_CHANGES),
    link: ({ changed }, { device }) => ({
      to: '/devices',
      search: { search: afterEdit(changed, 'serialNumber', device.serialNumber) },
    }),
  },
  createTag: {
    pending: 'Opening the New tag form…',
    label: FORM_TITLES.createTag,
    Form: CreateTagBody,
    saved: ({ tag }) => `Added ${tag.name} (${tag.code}) on ${tag.device}`,
    link: ({ tag }) => ({ to: '/tags', search: { search: tag.code } }),
  },
  editTag: {
    pending: 'Opening the tag…',
    label: FORM_TITLES.editTag,
    Form: EditTagBody,
    saved: ({ changed }, { tag }) => savedEdit(changed, tag.name, TAG_CHANGES),
    link: ({ changed }, { tag }) => ({ to: '/tags', search: { search: afterEdit(changed, 'code', tag.code) } }),
  },
  createAsset: {
    pending: 'Opening the New asset form…',
    label: FORM_TITLES.createAsset,
    Form: CreateAssetBody,
    saved: ({ asset }) =>
      `Added ${asset.name} (${asset.code}) ${asset.parent ? `under ${asset.parent}` : 'at the top of the tree'}`,
    link: ({ asset }) => ({ to: '/assets', search: { search: asset.code } }),
  },
  editAsset: {
    pending: 'Opening the asset…',
    label: FORM_TITLES.editAsset,
    Form: EditAssetBody,
    saved: ({ changed }, { asset }) => savedEdit(changed, asset.name, ASSET_CHANGES),
    link: ({ changed }, { asset }) => ({ to: '/assets', search: { search: afterEdit(changed, 'code', asset.code) } }),
  },
  createLogbookEntry: {
    pending: 'Opening the logbook form…',
    label: FORM_TITLES.createLogbookEntry,
    Form: CreateLogbookEntryBody,
    saved: ({ entry }) =>
      `Wrote ${categoryLabel(entry.category)} “${entry.title}”${entry.asset ? ` on ${entry.asset}` : ''}`,
    link: ({ entry }) => ({ to: '/logbook', search: { search: entry.title } }),
  },
  editLogbookEntry: {
    pending: 'Opening the entry…',
    label: FORM_TITLES.editLogbookEntry,
    Form: EditLogbookEntryBody,
    saved: ({ changed }, { entry }) => savedEdit(changed, entry.title, ENTRY_CHANGES, 'title'),
    link: ({ changed }, { entry }) => ({ to: '/logbook', search: { search: afterEdit(changed, 'title', entry.title) } }),
  },
  scheduleShift: {
    pending: 'Opening the schedule form…',
    label: FORM_TITLES.scheduleShift,
    Form: ScheduleShiftBody,
    saved: ({ scheduled }) =>
      scheduled.shifts === 1
        ? `Scheduled ${scheduled.person} on ${scheduled.shift}, ${scheduled.from}`
        : `Scheduled ${scheduled.person} on ${scheduled.shift}: ${shiftCount(scheduled.shifts)}, ${scheduled.from} to ${scheduled.to}`,
    link: ({ scheduled }) => ({ to: '/shifts', search: { date: scheduled.from } }),
  },
  editShift: {
    pending: 'Opening the shift…',
    label: FORM_TITLES.editShift,
    Form: EditShiftBody,
    saved: ({ changed, shifts }, { shift }) => {
      const which = `${shift.person}’s ${shift.shift} shift on ${shift.date}`;
      if (shifts === 0) return `Saved nothing: the shifts it applied to had already started`;
      const many = shifts > 1 ? ` (${shiftCount(shifts)})` : '';
      return changed
        ? `Saved ${which}${many}: ${describeChanges(changed, SHIFT_CHANGES)}`
        : `Saved ${which} without changes`;
    },
    link: ({ changed }, { shift }) => ({ to: '/shifts', search: { date: afterEdit(changed, 'date', shift.date) } }),
  },
  copyShiftWeek: {
    pending: 'Opening the Copy a week form…',
    label: FORM_TITLES.copyShiftWeek,
    Form: CopyShiftWeekBody,
    saved: ({ copied }) => `Copied ${shiftCount(copied.shifts)}, ${copied.from} to ${copied.to}`,
    link: ({ copied }) => ({ to: '/shifts', search: { date: copied.from } }),
  },
  createShiftTemplate: {
    pending: 'Opening the New shift template form…',
    label: FORM_TITLES.createShiftTemplate,
    Form: CreateShiftTemplateBody,
    saved: ({ template }) => `Added the shift “${template.name}”, ${templateTimes(template).label}`,
    link: () => ({ to: '/shifts', search: {} }),
  },
  editShiftTemplate: {
    pending: 'Opening the shift template…',
    label: FORM_TITLES.editShiftTemplate,
    Form: EditShiftTemplateBody,
    saved: ({ changed }, { template }) => savedEdit(changed, template.name, TEMPLATE_CHANGES),
    link: () => ({ to: '/shifts', search: {} }),
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
