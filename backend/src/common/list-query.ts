import { BadRequestException } from '@nestjs/common';
import { parseSort, resolveTimeRange, type Paginated, type SortValue, type TimeRangeInput } from '@gen-ui/shared';

/**
 * Helpers that turn the shared list-query shapes (`@gen-ui/shared`) into
 * Prisma arguments, so every list endpoint pages, sorts and filters by time
 * the same way.
 */

export function pageArgs(query: { page: number; pageSize: number }): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function toPaginated<T>(
  items: T[],
  total: number,
  query: { page: number; pageSize: number },
): Paginated<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}

type Direction = 'asc' | 'desc';

/**
 * `sort=-raisedAt` → `[{ raisedAt: 'desc' }, { id: 'asc' }]`. Each allowed
 * field maps to its Prisma `orderBy`; the id tie-breaker keeps pages stable
 * when many rows share a value.
 */
export function orderBy<F extends string, M extends Record<F, (direction: Direction) => object>>(
  sort: SortValue<F>,
  fields: M,
): Array<ReturnType<M[F]> | { id: Direction }> {
  const { field, direction } = parseSort(sort);
  return [fields[field](direction) as ReturnType<M[F]>, { id: 'asc' }];
}

/** Sort a nullable column with the empty values at the end, whichever the direction. */
export const nullsLast = (direction: Direction) => ({ sort: direction, nulls: 'last' as const });

/** Prisma filter for a DateTime column from `range`/`from`/`to`; `undefined` when unbounded. */
export function timeWindow(query: TimeRangeInput): { gte?: Date; lt?: Date } | undefined {
  const { from, to } = resolveTimeRange(query);
  if (from && to && from >= to) throw new BadRequestException('`from` must be before `to`');
  if (!from && !to) return undefined;
  return { ...(from && { gte: from }), ...(to && { lt: to }) };
}

/** Concrete bounds for endpoints that always need both ends (charts). */
export function requiredWindow(query: TimeRangeInput): { from: Date; to: Date } {
  const now = new Date();
  const { from, to = now } = resolveTimeRange(query, now);
  // Only `to` given: fall back to the relative range ending there.
  const start = from ?? (query.range ? resolveTimeRange({ range: query.range }, to).from! : new Date(to.getTime() - 86_400_000));
  if (start >= to) throw new BadRequestException('`from` must be before `to`');
  return { from: start, to };
}

/**
 * Asset subtree filter: the asset itself and everything below it. Relies on
 * `Asset.path` being `/<root>/…/<self>/`, so containing `/<id>/` means
 * "at or under <id>".
 */
export function withinAsset(assetId: string) {
  return { path: { contains: `/${assetId}/` } };
}

export function insensitive(search: string) {
  return { contains: search, mode: 'insensitive' as const };
}

export const iso = (date: Date): string => date.toISOString();
export const isoOrNull = (date: Date | null): string | null => date?.toISOString() ?? null;
