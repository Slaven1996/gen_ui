import type { z } from 'zod';

/** First message per top-level field, from a failed `safeParse`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

/** `''` → `null` for optional text inputs; numbers parsed, blanks to `null`. */
export const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim());
export const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));
