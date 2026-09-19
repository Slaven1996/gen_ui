import { z } from 'zod';

export const ROLES = ['ADMIN', 'USER'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** The only user shape that ever leaves the API (never includes secrets). */
export const PublicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: RoleSchema,
  isActive: z.boolean(),
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const LoginRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1, 'Password is required').max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Returned by /auth/login and /auth/refresh. The refresh token travels only as an httpOnly cookie. */
export interface AuthResponse {
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: PublicUser;
}

/** Machine-readable codes the API attaches to auth errors. */
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  REFRESH_INVALID: 'REFRESH_INVALID',
  /** A just-rotated refresh token was replayed within the grace window (usually a multi-tab race). */
  REFRESH_RACE: 'REFRESH_RACE',
  REFRESH_REUSED: 'REFRESH_REUSED',
} as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
