/** Display formatting, in the browser's locale and time zone. */

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const shortDateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });

export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFormat.format(new Date(iso)) : '—');
export const formatDate = (iso: string | null | undefined) => (iso ? dateFormat.format(new Date(iso)) : '—');
export const formatTime = (iso: string | null | undefined) => (iso ? timeFormat.format(new Date(iso)) : '—');
export const formatShortDateTime = (iso: string | null | undefined) =>
  iso ? shortDateTimeFormat.format(new Date(iso)) : '—';

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

/** "5 min ago", "in 2 hr", "yesterday". */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  let value = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return relativeFormat.format(Math.round(value), unit);
    value /= size;
  }
  return formatDate(iso);
}

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

/** `4.62 m`, `1 250 m³/h`. */
export function formatReading(value: number | null | undefined, unit: string | null | undefined, digits = 2): string {
  const number = formatNumber(value, digits);
  return unit && number !== '—' ? `${number} ${unit}` : number;
}

/** `45 min`, `3 h 20 min`, `2 d 4 h`. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  if (hours < 24) return rounded % 60 ? `${hours} h ${rounded % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

export const durationBetween = (from: string, to: string | null) =>
  ((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60_000;

/** `MAINTENANCE` → `Maintenance`, `ON_CALL` → `On call`. */
export const humanize = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');

/** Long text in a hint: its start, in quotes. */
export const quoted = (value: string) => (value ? `“${value.length > 60 ? `${value.slice(0, 59)}…` : value}”` : 'empty');

/** A count with its noun: "1 shift", "3 shifts", "2 people". */
export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
