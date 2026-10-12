/** Series colour by position in the caller's tag list — stable while other tags come and go. */
export const seriesColor = (index: number) => `var(--chart-${(index % 8) + 1})`;
