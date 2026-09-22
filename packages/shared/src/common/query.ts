import { z } from 'zod';

/**
 * Building blocks for list-endpoint query schemas.
 *
 * Every list endpoint is described by ONE Zod object built from these helpers,
 * and that same object is used in three places:
 *   - the API validates `@Query()` with it,
 *   - the web app's route validates its URL search params with it,
 *   - Generative UI tools take it as their input.
 * So a URL like `/alarms?state=ACTIVE&severity=CRITICAL,HIGH&range=7d` is at
 * once a page, an API call and a tool call.
 *
 * Keep these schemas free of object-level refinements: Zod refuses `.pick()`
 * on refined objects, and dashboard widgets pick their config from them.
 */

/**
 * A multi-value filter. Accepts `a,b`, repeated keys (`?x=a&x=b`) or a real
 * array, so it reads the same from a query string, a router URL and JSON.
 * An empty value means "no filter".
 */
export function csvList<T extends z.ZodType<string, string>>(item: T, description: string, max = 50) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((value) => {
      const parts = (Array.isArray(value) ? value : [value])
        .flatMap((entry) => entry.split(','))
        .map((entry) => entry.trim())
        .filter(Boolean);
      return parts.length > 0 ? [...new Set(parts)] : undefined;
    })
    .pipe(z.array(item).max(max).optional())
    .optional()
    .describe(description);
}

/** Multi-value enum filter; the description lists the accepted values for the API docs. */
export const csvEnum = <const T extends readonly [string, ...string[]]>(values: T, max = 50) =>
  csvList(z.enum(values), `Comma-separated, any of: ${values.join(', ')}`, max);

/** Multi-value id filter. */
export const csvIds = (description: string, max = 50) =>
  csvList(z.guid(), `Comma-separated ids. ${description}`, max);

/** `true`/`false` from a query string, or a real boolean from a router URL or JSON. */
export const queryBoolean = () =>
  z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]);

export const pageParams = (defaultPageSize = 20, maxPageSize = 100) => ({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
});

export const searchParam = (matches: string) =>
  z.string().trim().max(100).optional().describe(`Case-insensitive substring match on ${matches}.`);

export type SortValue<F extends string> = F | `-${F}`;

/** `sort=raisedAt` ascending, `sort=-raisedAt` descending — one field from an allowed list. */
export function sortParam<const F extends readonly [string, ...string[]]>(
  fields: F,
  fallback: SortValue<F[number]>,
) {
  const values = fields.flatMap((field) => [field, `-${field}`]) as [
    SortValue<F[number]>,
    ...SortValue<F[number]>[],
  ];
  // The cast only helps TypeScript see that `fallback` is one of `values`.
  return z.enum(values).default(fallback as never).describe('Sort field; prefix with "-" for descending.');
}

export function parseSort<F extends string>(sort: SortValue<F>): { field: F; direction: 'asc' | 'desc' } {
  return sort.startsWith('-')
    ? { field: sort.slice(1) as F, direction: 'desc' }
    : { field: sort as F, direction: 'asc' };
}

// ─── Time ranges ────────────────────────────────────────────────────────────

export const RELATIVE_RANGES = ['1h', '6h', '12h', '24h', '7d', '30d', '90d'] as const;
export const RelativeRangeSchema = z.enum(RELATIVE_RANGES);
export type RelativeRange = z.infer<typeof RelativeRangeSchema>;

const HOUR = 3_600_000;
export const RELATIVE_RANGE_MS: Record<RelativeRange, number> = {
  '1h': HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '24h': 24 * HOUR,
  '7d': 7 * 24 * HOUR,
  '30d': 30 * 24 * HOUR,
  '90d': 90 * 24 * HOUR,
};

export const RELATIVE_RANGE_LABELS: Record<RelativeRange, string> = {
  '1h': 'Last hour',
  '6h': 'Last 6 hours',
  '12h': 'Last 12 hours',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

const RANGE_DESCRIPTION = 'Relative window ending now. Ignored when `from` or `to` is set.';

const absoluteRange = {
  from: z.iso.datetime({ offset: true }).optional().describe('Absolute start (inclusive), ISO 8601.'),
  to: z.iso.datetime({ offset: true }).optional().describe('Absolute end (exclusive), ISO 8601. Defaults to now.'),
};

/**
 * `range` is relative to "now", so a saved link or widget keeps showing the
 * latest data. `from`/`to` are absolute and take precedence over `range`.
 * Without any of them the list is not limited in time.
 */
export const timeRangeParams = () => ({
  range: RelativeRangeSchema.optional().describe(RANGE_DESCRIPTION),
  ...absoluteRange,
});

/** Like `timeRangeParams`, for endpoints that always need a window (charts). */
export const requiredTimeRangeParams = (fallback: RelativeRange) => ({
  range: RelativeRangeSchema.default(fallback).describe(RANGE_DESCRIPTION),
  ...absoluteRange,
});

export interface TimeRangeInput {
  range?: RelativeRange;
  from?: string;
  to?: string;
}

/** Concrete bounds for a time-range query; either side may be open. */
export function resolveTimeRange(
  input: TimeRangeInput,
  now: Date = new Date(),
): { from?: Date; to?: Date } {
  if (input.from || input.to) {
    return {
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
    };
  }
  if (input.range) {
    return { from: new Date(now.getTime() - RELATIVE_RANGE_MS[input.range]), to: now };
  }
  return {};
}

/** An IANA time zone such as `Europe/Zagreb`, used to align day buckets. */
export const timeZoneParam = () =>
  z
    .string()
    .max(64)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone')
    .default('UTC')
    .describe('IANA time zone for day-sized buckets, e.g. Europe/Zagreb.');

// ─── Shared response pieces ─────────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** The envelope every paginated list endpoint returns, around whichever item schema. */
export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.int().describe('Rows matching the filter, across every page.'),
    page: z.int(),
    pageSize: z.int(),
  });

/** Unpaginated collections (small lookups, calendars). */
export const itemsSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

/** A user as other records reference them. */
export const UserRefSchema = z.object({ id: z.guid(), name: z.string() }).meta({ id: 'UserRef' });
export type UserRef = z.infer<typeof UserRefSchema>;

export const nullableText = (max: number) => z.string().trim().max(max).nullable();
