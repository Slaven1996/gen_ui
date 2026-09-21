import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from './users.js';

/**
 * What a signed-in user may change about their own account.
 *
 * Strict on purpose: sending `role` or `isActive` here is rejected with a 400
 * rather than quietly ignored, so the boundary is visible in the response.
 *
 * Deliberately not here: `role` and `isActive` (privilege escalation), and
 * `email` — it is the login identifier, and changing it safely needs a
 * verification flow this app does not have. Admins cannot change it either.
 */
export const UpdateProfileSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Name is required').max(100),
  })
  .meta({ id: 'UpdateProfile' });
export type UpdateProfileDto = z.output<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, 'Enter your current password').max(256),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(256),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  })
  .meta({ id: 'ChangePassword' });
export type ChangePasswordDto = z.output<typeof ChangePasswordSchema>;

/** Codes the profile endpoints attach to their errors. */
export const PROFILE_ERROR_CODES = {
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
} as const;
