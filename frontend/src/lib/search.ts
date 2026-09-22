import { parseSearchWith, stringifySearchWith } from '@tanstack/react-router';
import type { z } from 'zod';

/**
 * URL search params ⇄ API query params.
 *
 * Every list page validates its URL with the same Zod schema the API validates
 * its query with (`@gen-ui/shared`). So `/alarms?state=ACTIVE,CLEARED&range=7d`
 * maps one-to-one onto `GET /api/alarms?state=ACTIVE,CLEARED&range=7d`, and a
 * Generative UI tool that emits those params can deep-link to the page.
 */

/** A Standard Schema validator, the shape TanStack Router accepts for `validateSearch`. */
export interface SearchValidator<Input, Output> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => { value: Output };
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

/**
 * `validateSearch` from a shared query schema. Lenient where the API is
 * strict: a bad value in a hand-edited or stale URL drops just that param
 * (so its default applies) instead of failing the whole route.
 *
 * Typed with the schema's input for links (`<Link search>`, `navigate`), so
 * every param is optional there, and its output for components.
 */
export function searchSchema<S extends z.ZodObject>(schema: S): SearchValidator<z.input<S>, z.output<S>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'gen-ui',
      validate: (value) => ({ value: parseLeniently(schema, value) }),
    },
  };
}

export function parseLeniently<S extends z.ZodObject>(schema: S, raw: unknown): z.output<S> {
  const input: Record<string, unknown> = raw && typeof raw === 'object' ? { ...raw } : {};
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    const invalid = result.error.issues
      .map((issue) => issue.path[0])
      .filter((key): key is string => typeof key === 'string' && key in input);
    if (invalid.length === 0) break;
    for (const key of invalid) delete input[key];
  }
  return schema.parse({});
}

/** The values a schema fills in when a param is absent — stripped from URLs to keep them short. */
export function defaultsOf<S extends z.ZodObject>(schema: S): Partial<z.output<S>> {
  return schema.parse({});
}

const stringifyWithCsvArrays = stringifySearchWith(
  (value: unknown) => (Array.isArray(value) ? value.join(',') : JSON.stringify(value)),
  JSON.parse,
);

/**
 * Router serializers: arrays are written as `a,b` — the form the API reads —
 * instead of JSON, and commas stay readable instead of `%2C`.
 */
export const parseSearch = parseSearchWith(JSON.parse);
export const stringifySearch = (search: Record<string, unknown>) =>
  stringifyWithCsvArrays(search).replace(/%2C/gi, ',');

/** Axios query serializer with the same conventions: arrays as `a,b`, empty values left out. */
export function serializeQuery(params: Record<string, unknown> | undefined): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) query.set(key, value.join(','));
    } else {
      query.set(key, String(value));
    }
  }
  return query.toString().replace(/%2C/gi, ',');
}

/** The browser's IANA time zone, sent with bucketed queries so "a day" is a local day. */
export const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
