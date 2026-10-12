/** One grid row, in px (11rem); widgets are 1–3 rows tall. */
export const ROW_HEIGHT = 176;
export const GAP = 16;
/** Card header and padding, subtracted to get the body's height. */
export const CARD_CHROME = 76;

/** How the width and height choices read, in the grid's resize controls and the widget dialog. */
export const WIDTH_LABELS: Record<number, string> = { 3: 'Quarter', 4: 'Third', 6: 'Half', 8: 'Two thirds', 12: 'Full width' };
export const HEIGHT_LABELS: Record<number, string> = { 1: 'Short', 2: 'Standard', 3: 'Tall' };
