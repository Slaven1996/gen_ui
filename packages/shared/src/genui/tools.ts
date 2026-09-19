import { z } from 'zod';
import type { UIMessage } from 'ai';
import { PublicUserSchema, RoleSchema } from '../auth.js';

/**
 * Generative UI tool contracts.
 *
 * The backend attaches `execute` to these schemas and hands them to the model;
 * the frontend renders each tool part with a component keyed by tool name.
 * Keeping the schemas here is what keeps both sides type-synced.
 */

const displayedOutput = z.object({ displayed: z.literal(true) });

export const StatCardSchema = z.object({
  label: z.string().max(60).describe('Short metric name, e.g. "Active users"'),
  value: z.string().max(40).describe('Pre-formatted value, e.g. "1,284" or "$12.4k"'),
  change: z.number().optional().describe('Percent change vs. the previous period, e.g. 12.5 or -3'),
  hint: z.string().max(120).optional().describe('One short line of context'),
});
export type StatCard = z.infer<typeof StatCardSchema>;

export const ShowStatCardsInputSchema = z.object({
  title: z.string().max(100).optional(),
  cards: z.array(StatCardSchema).min(1).max(8),
});

export const ChartSeriesSchema = z.object({
  key: z.string().describe('Property name in each data row'),
  label: z.string().describe('Human-readable series name'),
});

export const ShowChartInputSchema = z.object({
  title: z.string().max(100),
  description: z.string().max(300).optional(),
  type: z.enum(['bar', 'line', 'area']),
  xKey: z.string().describe('Property name in each data row used for the x axis'),
  series: z.array(ChartSeriesSchema).min(1).max(5),
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .min(1)
    .max(200),
});

export const ListUsersInputSchema = z.object({
  search: z.string().max(100).optional().describe('Matches name or email'),
  role: RoleSchema.optional(),
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional().describe('Defaults to 20'),
});

export const ListUsersOutputSchema = z.object({
  users: z.array(PublicUserSchema),
  total: z.number().int(),
});

export const genUiToolSchemas = {
  showStatCards: {
    description:
      'Render a row of KPI stat cards in the chat. Use for a handful of headline numbers.',
    inputSchema: ShowStatCardsInputSchema,
    outputSchema: displayedOutput,
  },
  showChart: {
    description:
      'Render a bar, line or area chart in the chat from tabular data you already have.',
    inputSchema: ShowChartInputSchema,
    outputSchema: displayedOutput,
  },
  listUsers: {
    description:
      'Query application users (admins only) and render them as a table in the chat.',
    inputSchema: ListUsersInputSchema,
    outputSchema: ListUsersOutputSchema,
  },
} as const;

type ToolContract = { inputSchema: z.ZodType; outputSchema: z.ZodType };
type ToolIO<T extends ToolContract> = {
  input: z.infer<T['inputSchema']>;
  output: z.infer<T['outputSchema']>;
};

/** `UITools`-compatible map: tool name → { input, output }. */
export type GenUITools = {
  [K in keyof typeof genUiToolSchemas]: ToolIO<(typeof genUiToolSchemas)[K]>;
};
export type GenUIToolName = keyof GenUITools;

/** Per-message metadata streamed on `start` / `finish`. */
export interface GenUIMetadata {
  model?: string;
  createdAt?: number;
  /** AI SDK finish reason; `content-filter` means the model refused. */
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';
}

export type GenUIMessage = UIMessage<GenUIMetadata, Record<string, never>, GenUITools>;
