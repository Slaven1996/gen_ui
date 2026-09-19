import { tool } from 'ai';
import { genUiToolSchemas } from '@gen-ui/shared';
import { toPublicUser, type AuthUser } from '../../users/user.mapper.js';
import type { UsersRepository } from '../../users/users.repository.js';

/** Data tool: queries the database on the server, the client renders the result as a table. */
export const listUsersTool = (users: UsersRepository, actor: AuthUser) =>
  tool({
    ...genUiToolSchemas.listUsers,
    execute: async (input) => {
      // Also filtered out via `activeTools`; checked again here in case that ever changes.
      if (actor.role !== 'ADMIN') throw new Error('Only administrators can list users.');

      const { items, total } = await users.list({
        page: 1,
        pageSize: input.limit ?? 20,
        search: input.search,
        role: input.role,
        isActive: input.isActive,
      });
      return { users: items.map(toPublicUser), total };
    },
  });
