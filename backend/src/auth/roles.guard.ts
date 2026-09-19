import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../users/user.mapper.js';

/** Global guard enforcing `@Roles([...])`; runs after `JwtAuthGuard`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride(Roles, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;

    const user = context.switchToHttp().getRequest<Request>().user as AuthUser | undefined;
    return !!user && roles.includes(user.role);
  }
}
