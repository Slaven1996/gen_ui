import { Reflector } from '@nestjs/core';
import type { Role } from '@gen-ui/shared';

/** Restrict a route (or controller) to the given roles, e.g. `@Roles(['ADMIN'])`. */
export const Roles = Reflector.createDecorator<Role[]>();
