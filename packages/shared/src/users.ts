import { z } from 'zod';
import { PublicUserSchema, RoleSchema } from './auth.js';
import {
  itemsSchema,
  pageParams,
  paginatedSchema,
  searchParam,
  timeZoneParam,
  UserRefSchema,
} from './common/query.js';

export const PASSWORD_MIN_LENGTH = 12;

export const CreateUserSchema = z
  .object({
    email: z.email().max(254),
    name: z.string().trim().min(1, 'Name is required').max(100),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(256),
    role: RoleSchema.default('USER'),
  })
  .meta({ id: 'CreateUser' });
export type CreateUserInput = z.input<typeof CreateUserSchema>;
export type CreateUserDto = z.output<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: RoleSchema,
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateUser' });
export type UpdateUserDto = z.output<typeof UpdateUserSchema>;

/** An account's status as the Users page shows it; stored as `is_active`. */
export const USER_STATUSES = ['ACTIVE', 'DEACTIVATED'] as const;
export const UserStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/**
 * The last sign-in filter: `never` (no sign-in yet), or a calendar day
 * (YYYY-MM-DD) the last sign-in fell on. Leaving it out means "any".
 */
export const LastSignInFilterSchema = z.union([z.literal('never'), z.iso.date()]);
export type LastSignInFilter = z.infer<typeof LastSignInFilterSchema>;

/**
 * No `.meta({ id })` here on purpose: an identified schema is emitted as a
 * single `$ref`, and the OpenAPI generator can only expand an object into one
 * query parameter per property while it can still see those properties.
 */
export const ListUsersQuerySchema = z.object({
  ...pageParams(),
  search: searchParam('email or name'),
  role: RoleSchema.optional(),
  status: UserStatusSchema.optional().describe('Only active, or only deactivated, accounts.'),
  lastSignIn: LastSignInFilterSchema.optional().describe(
    '`never`: accounts that have never signed in. A date (YYYY-MM-DD): accounts whose last sign-in fell on that day in `timeZone`.',
  ),
  timeZone: timeZoneParam().describe('IANA time zone a `lastSignIn` date is a day in, e.g. Europe/Zagreb.'),
});
export type ListUsersQueryInput = z.input<typeof ListUsersQuerySchema>;
export type ListUsersQuery = z.output<typeof ListUsersQuerySchema>;

export const PaginatedUsersSchema = paginatedSchema(PublicUserSchema).meta({
  id: 'PaginatedUsers',
});

/** Active users as pickers need them (shift planning, logbook filters) — open to every role. */
export const UserOptionsSchema = itemsSchema(UserRefSchema).meta({ id: 'UserOptions' });
