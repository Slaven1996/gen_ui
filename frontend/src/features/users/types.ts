import type { PublicUser, Role, UpdateUserDto } from '@gen-ui/shared';

/** Admin row actions; without them the table is read-only. */
export interface UserActions {
  currentUserId: string;
  onUpdate: (user: PublicUser, patch: UpdateUserDto) => void;
}

/** What the form can start with instead of blanks: the assistant's pre-fill. Never a password. */
export interface CreateUserPrefill {
  name?: string;
  email?: string;
  role?: Role;
}
