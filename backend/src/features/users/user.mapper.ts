import type { PublicUser } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';

/** Columns that are safe to load for everything except password checks. */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

/** What `JwtStrategy.validate` attaches to `req.user`. */
export type AuthUser = UserRecord;

/** Explicit serialization: the only way a user leaves the API. */
export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
