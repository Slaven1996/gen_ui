import type { ComponentType } from 'react';
import { getStaticToolName } from 'ai';
import type { GenUIToolName, GenUITools } from '@gen-ui/shared';
import { ChartTool } from './chart-card';
import { StatCardsTool } from './stat-cards';
import type { GenUIToolPart, ToolPartFor } from './types';
import { UsersTableTool } from './users-table';

/**
 * Tool name → React component. Adding a Generative UI component means:
 * 1. add its schema to `genUiToolSchemas` (packages/shared),
 * 2. implement the tool on the backend (ai/tools),
 * 3. register a renderer here — TypeScript flags any tool without one.
 */
const renderers: { [N in GenUIToolName]: ComponentType<{ part: ToolPartFor<N> }> } = {
  showStatCards: StatCardsTool,
  showChart: ChartTool,
  listUsers: UsersTableTool,
};

export function GenUiToolPart({ part }: { part: GenUIToolPart }) {
  const Renderer = renderers[getStaticToolName<GenUITools>(part)] as
    | ComponentType<{ part: GenUIToolPart }>
    | undefined;
  return Renderer ? <Renderer part={part} /> : null;
}
