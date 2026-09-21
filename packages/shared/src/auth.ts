import { z } from 'zod';

export const ROLES = ['ADMIN', 'USER'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/**
 * The only user shape that ever leaves the API (never includes secrets).
 *
 * The `id` in `.meta()` names the schema in the OpenAPI document: it is
 * extracted once into `components.schemas` and referenced from everywhere it
 * appears, instead of being inlined into each operation.
 */
export const PublicUserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    role: RoleSchema,
    isActive: z.boolean(),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'PublicUser', description: 'A user as the API exposes it.' });
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const LoginRequestSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(1, 'Password is required').max(256),
  })
  .meta({ id: 'LoginRequest' });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Returned by /auth/login and /auth/refresh. The refresh token travels only as an httpOnly cookie. */
export const AuthResponseSchema = z
  .object({
    accessToken: z.string().describe('JWT. Send it as `Authorization: Bearer <token>`.'),
    expiresIn: z.int().positive().describe('Access token lifetime in seconds.'),
    user: PublicUserSchema,
  })
  .meta({ id: 'AuthResponse' });
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/** Machine-readable codes the API attaches to auth errors. */
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  REFRESH_INVALID: 'REFRESH_INVALID',
  /** A just-rotated refresh token was replayed within the grace window (usually a multi-tab race). */
  REFRESH_RACE: 'REFRESH_RACE',
  REFRESH_REUSED: 'REFRESH_REUSED',
} as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
