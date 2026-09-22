/** Calendar-week helpers in the viewer's local time (weeks start on Monday). */

/** `YYYY-MM-DD` of a local date. */
export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Local midnight of a `YYYY-MM-DD` key. */
export const fromDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const startOfWeek = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7; // Monday = 0
  return addDays(start, -offset);
};

export const weekDays = (weekStart: Date) => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

const rangeFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
export const describeWeek = (weekStart: Date) =>
  `${rangeFormat.format(weekStart)} – ${rangeFormat.format(addDays(weekStart, 6))}, ${addDays(weekStart, 6).getFullYear()}`;
