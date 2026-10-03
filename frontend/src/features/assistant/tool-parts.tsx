import { useState, type ComponentType } from 'react';
import { useNavigate, type LinkProps } from '@tanstack/react-router';
import { getStaticToolName, type ToolUIPart } from 'ai';
import { CircleAlert } from 'lucide-react';
import {
  ListAlarmDefinitionsQuerySchema,
  ListAlarmsQuerySchema,
  ListAssetsQuerySchema,
  ListAuditLogsQuerySchema,
  ListDevicesQuerySchema,
  ListLogbookQuerySchema,
  ListTagsQuerySchema,
  ListUsersQuerySchema,
  type GenUIToolName,
  type GenUITools,
} from '@gen-ui/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewCard, ViewFullPageLink } from '@/components/view-card';
import { AlarmDetailSheet } from '@/features/alarms/alarm-detail-sheet';
import { AlarmsTable } from '@/features/alarms/alarms-table';
import { DefinitionsTable } from '@/features/alarms/definitions-table';
import { AssetsTable } from '@/features/assets/assets-table';
import { DevicesTable } from '@/features/devices/devices-table';
import { AuditTable } from '@/features/logbook/audit-table';
import { LogbookTable } from '@/features/logbook/logbook-table';
import { TagsTable } from '@/features/tags/tags-table';
import { UsersTable } from '@/features/users/users-table';

/*
 * Generative UI, the rendering half. A tool part in a message is what Claude
 * decided [AI]: which tool, with which input (e.g. `{ title: 'Admins',
 * role: 'ADMIN' }`). Turning it into a component is fixed code [app]: the
 * registry below maps each tool to a domain view, and that view loads its own
 * data through the REST API, exactly as its page does. The model never
 * produces markup or rows for the screen.
 */

export type GenUIToolPart = ToolUIPart<GenUITools>;

type Input<N extends GenUIToolName> = GenUITools[N]['input'];
type Output<N extends GenUIToolName> = GenUITools[N]['output'];

/** How one tool's calls show in the chat. */
interface ToolRenderer<N extends GenUIToolName> {
  /** Shown while the model is still writing the call. */
  pending: string;
  title: (input: Input<N>) => string;
  /** The full page with the same query, for "Open in new tab". */
  link: (input: Input<N>) => Pick<LinkProps, 'to' | 'search'>;
  /** The view inside the frame, once the call is complete — usually the domain's own table. */
  Body: ComponentType<{ input: Input<N> }>;
  /** The result in a few words, for text-only answers. */
  found: (output: Output<N>) => string;
}

// ─── Users ──────────────────────────────────────────────────────────────────

/** A users call as a `/users` query: every field but the title. */
const usersQuery = ({ title: _title, ...filters }: Input<'listUsers'>) => filters;

/**
 * The Users page's own table with the call's filters, five rows a page: the
 * same columns, and the same row actions for admins.
 */
function UsersBody({ input }: { input: Input<'listUsers'> }) {
  return <UsersTable query={ListUsersQuerySchema.parse({ ...usersQuery(input), pageSize: 5 })} dense />;
}

// ─── Alarm rules ────────────────────────────────────────────────────────────

/** An alarm-rules call as an `/alarm-rules` query: every field but the title. */
const alarmRulesQuery = ({ title: _title, ...filters }: Input<'listAlarmRules'>) => filters;

/** The Alarm rules page's own table: the same columns, and edit, delete and enable for admins. */
function AlarmRulesBody({ input }: { input: Input<'listAlarmRules'> }) {
  return (
    <DefinitionsTable query={ListAlarmDefinitionsQuerySchema.parse({ ...alarmRulesQuery(input), pageSize: 5 })} dense />
  );
}

// ─── Audit log ──────────────────────────────────────────────────────────────

/** An audit call as an `/audit` query: every field but the title. */
const auditQuery = ({ title: _title, ...filters }: Input<'listAuditLogs'>) => filters;

/** The Audit log page's own table, newest first. Read-only, like the page. */
function AuditBody({ input }: { input: Input<'listAuditLogs'> }) {
  return <AuditTable query={ListAuditLogsQuerySchema.parse({ ...auditQuery(input), pageSize: 5 })} dense />;
}

// ─── Alarms ─────────────────────────────────────────────────────────────────

/** An alarms call as an `/alarms` query: every field but the title. */
const alarmsQuery = ({ title: _title, ...filters }: Input<'listAlarms'>) => filters;

/**
 * The Alarms page's own table. A click opens the alarm in the same sheet as
 * on the page (acknowledge, clear, chart, timeline), kept here instead of in
 * the URL. Selecting several for one acknowledgement stays on the page.
 */
function AlarmsBody({ input }: { input: Input<'listAlarms'> }) {
  const [openAlarm, setOpenAlarm] = useState<string>();
  return (
    <>
      <AlarmsTable
        query={ListAlarmsQuerySchema.parse({ ...alarmsQuery(input), pageSize: 5 })}
        dense
        onAlarmClick={(alarm) => setOpenAlarm(alarm.id)}
      />
      <AlarmDetailSheet alarmId={openAlarm} onClose={() => setOpenAlarm(undefined)} />
    </>
  );
}

// ─── Logbook ────────────────────────────────────────────────────────────────

/** A logbook call as a `/logbook` query: every field but the title. */
const logbookQuery = ({ title: _title, ...filters }: Input<'listLogbookEntries'>) => filters;

/** The Logbook page's own table: authors edit their entries, authors and admins delete them. */
function LogbookBody({ input }: { input: Input<'listLogbookEntries'> }) {
  return <LogbookTable query={ListLogbookQuerySchema.parse({ ...logbookQuery(input), pageSize: 5 })} dense />;
}

// ─── Devices ────────────────────────────────────────────────────────────────

/** A devices call as a `/devices` query: every field but the title. */
const devicesQuery = ({ title: _title, ...filters }: Input<'listDevices'>) => filters;

/** The Devices page's own table: the same columns, and edit and delete for admins. */
function DevicesBody({ input }: { input: Input<'listDevices'> }) {
  return <DevicesTable query={ListDevicesQuerySchema.parse({ ...devicesQuery(input), pageSize: 5 })} dense />;
}

// ─── Tags ───────────────────────────────────────────────────────────────────

/** A tags call as a `/tags` query: every field but the title. */
const tagsQuery = ({ title: _title, ...filters }: Input<'listTags'>) => filters;

/** The Tags page's own table with live values: chart for everyone; add a rule, edit and delete for admins. */
function TagsBody({ input }: { input: Input<'listTags'> }) {
  return <TagsTable query={ListTagsQuerySchema.parse({ ...tagsQuery(input), pageSize: 5 })} dense />;
}

// ─── Assets ─────────────────────────────────────────────────────────────────

/** An assets call as an `/assets` query: every field but the title. */
const assetsQuery = ({ title: _title, ...filters }: Input<'listAssets'>) => filters;

/** The Assets page's own table: a click opens the asset's page; edit and delete for admins. */
function AssetsBody({ input }: { input: Input<'listAssets'> }) {
  const navigate = useNavigate();
  return (
    <AssetsTable
      query={ListAssetsQuerySchema.parse({ ...assetsQuery(input), pageSize: 5 })}
      dense
      onAssetClick={(asset) => navigate({ to: '/assets/$assetId', params: { assetId: asset.id } })}
    />
  );
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Tool name → how its calls render. A new tool adds one entry, usually
 * wrapping its domain's existing table (which brings its own role-based row
 * actions); TypeScript flags a tool without one.
 */
const RENDERERS: { [N in GenUIToolName]: ToolRenderer<N> } = {
  listUsers: {
    pending: 'Looking up users…',
    title: (input) => input.title,
    link: (input) => ({ to: '/users', search: usersQuery(input) }),
    Body: UsersBody,
    found: (output) => `${output.total} found`,
  },
  listAlarmRules: {
    pending: 'Looking up alarm rules…',
    title: (input) => input.title,
    link: (input) => ({ to: '/alarm-rules', search: alarmRulesQuery(input) }),
    Body: AlarmRulesBody,
    found: (output) => `${output.total} found`,
  },
  listAuditLogs: {
    pending: 'Searching the audit log…',
    title: (input) => input.title,
    link: (input) => ({ to: '/audit', search: auditQuery(input) }),
    Body: AuditBody,
    found: (output) => `${output.total} found`,
  },
  listAlarms: {
    pending: 'Looking up alarms…',
    title: (input) => input.title,
    link: (input) => ({ to: '/alarms', search: alarmsQuery(input) }),
    Body: AlarmsBody,
    found: (output) => `${output.total} found`,
  },
  listLogbookEntries: {
    pending: 'Searching the logbook…',
    title: (input) => input.title,
    link: (input) => ({ to: '/logbook', search: logbookQuery(input) }),
    Body: LogbookBody,
    found: (output) => `${output.total} found`,
  },
  listDevices: {
    pending: 'Looking up devices…',
    title: (input) => input.title,
    link: (input) => ({ to: '/devices', search: devicesQuery(input) }),
    Body: DevicesBody,
    found: (output) => `${output.total} found`,
  },
  listTags: {
    pending: 'Looking up tags…',
    title: (input) => input.title,
    link: (input) => ({ to: '/tags', search: tagsQuery(input) }),
    Body: TagsBody,
    found: (output) => `${output.total} found`,
  },
  listAssets: {
    pending: 'Looking up assets…',
    title: (input) => input.title,
    link: (input) => ({ to: '/assets', search: assetsQuery(input) }),
    Body: AssetsBody,
    found: (output) => `${output.total} found`,
  },
};

function rendererFor(part: GenUIToolPart): ToolRenderer<GenUIToolName> {
  // TypeScript can't pair a part from the union with its own entry; the tool name does.
  return RENDERERS[getStaticToolName<GenUITools>(part)] as unknown as ToolRenderer<GenUIToolName>;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** A tool call as a component: a skeleton while it is written, then its view and "Open in new tab". */
export function ToolPartView({ part }: { part: GenUIToolPart }) {
  const renderer = rendererFor(part);
  switch (part.state) {
    case 'input-streaming':
      return <ToolSkeleton label={renderer.pending} />;
    case 'output-error':
      return <ToolError message={part.errorText} />;
    default: {
      // The query is complete, so the view can fetch while the server still runs the tool.
      const { Body } = renderer;
      return (
        <ViewCard
          title={renderer.title(part.input)}
          action={<ViewFullPageLink {...renderer.link(part.input)} newTab />}
        >
          <Body input={part.input} />
        </ViewCard>
      );
    }
  }
}

/** A tool call in a text-only answer: one muted line, with the same link. */
export function ToolStatusLine({ part }: { part: GenUIToolPart }) {
  const renderer = rendererFor(part);
  switch (part.state) {
    case 'input-streaming':
      return <p className="text-xs text-muted-foreground">{renderer.pending}</p>;
    case 'output-error':
      return <p className="text-xs text-destructive">{part.errorText}</p>;
    default:
      return (
        <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          <span>
            {renderer.title(part.input)}
            {part.state === 'output-available' && ` · ${renderer.found(part.output)}`}
          </span>
          <ViewFullPageLink {...renderer.link(part.input)} newTab />
        </div>
      );
  }
}

function ToolSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Skeleton className="h-32" />
    </div>
  );
}

function ToolError({ message }: { message?: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>That lookup failed</AlertTitle>
      {message && <AlertDescription>{message}</AlertDescription>}
    </Alert>
  );
}
