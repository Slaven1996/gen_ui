import type { ComponentType } from 'react';
import type { LinkProps } from '@tanstack/react-router';
import { getStaticToolName, type ToolUIPart } from 'ai';
import { CircleAlert } from 'lucide-react';
import { ListUsersQuerySchema, type GenUIToolName, type GenUITools } from '@gen-ui/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewCard, ViewFullPageLink } from '@/components/view-card';
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
