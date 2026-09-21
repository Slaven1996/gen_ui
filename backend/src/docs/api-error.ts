import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * The envelope `AllExceptionsFilter` puts around every error response.
 *
 * Documentation only — nothing validates against it at runtime. It is kept
 * here, next to the filter that produces it, rather than in `@gen-ui/shared`,
 * because it describes the API's error surface and not a request contract.
 */
export const ApiErrorSchema = z
  .object({
    statusCode: z.int(),
    message: z
      .union([z.string(), z.array(z.string())])
      .describe('A sentence, or one entry per rejected field when validation failed.'),
    error: z.string().optional().describe('The HTTP status name, e.g. "Bad Request".'),
    code: z
      .string()
      .optional()
      .describe('Machine-readable reason. Present on auth and password errors.'),
    timestamp: z.iso.datetime(),
    path: z.string(),
  })
  .meta({ id: 'ApiError' });

/** `@ApiErrorResponse(404, 'No user with that id')` — the envelope, with a reason. */
export const ApiErrorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: ApiErrorSchema });

/** Every authenticated route answers these two the same way. */
export const AUTH_REQUIRED = 'No access token, or it has expired.';
export const ADMIN_ONLY = 'Signed in, but not an admin.';
