import { z } from 'zod';
import { RoleSchema } from './auth.js';

export const PASSWORD_MIN_LENGTH = 12;

export const CreateUserSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1, 'Name is required').max(100),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(256),
  role: RoleSchema.default('USER'),
});
export type CreateUserInput = z.input<typeof CreateUserSchema>;
export type CreateUserDto = z.output<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: RoleSchema,
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type UpdateUserDto = z.output<typeof UpdateUserSchema>;

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: RoleSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type ListUsersQueryInput = z.input<typeof ListUsersQuerySchema>;
export type ListUsersQuery = z.output<typeof ListUsersQuerySchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
