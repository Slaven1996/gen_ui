import { tool } from 'ai';
import { genUiToolSchemas } from '@gen-ui/shared';

/*
 * Display-only tools: the client renders straight from the (streamed) tool
 * input, so `execute` just acknowledges. Their input streams to the browser
 * as it is generated, which lets components render progressively.
 */

export const showStatCardsTool = () =>
  tool({
    ...genUiToolSchemas.showStatCards,
    execute: async () => ({ displayed: true as const }),
  });

export const showChartTool = () =>
  tool({
    ...genUiToolSchemas.showChart,
    execute: async () => ({ displayed: true as const }),
  });
