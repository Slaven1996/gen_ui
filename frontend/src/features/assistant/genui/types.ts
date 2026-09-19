import type { ToolUIPart } from 'ai';
import type { GenUIToolName, GenUITools } from '@gen-ui/shared';

export type GenUIToolPart = ToolUIPart<GenUITools>;

/** The streamed part for one tool, narrowed by name (e.g. `ToolPartFor<'showChart'>`). */
export type ToolPartFor<N extends GenUIToolName> = Extract<GenUIToolPart, { type: `tool-${N}` }>;
