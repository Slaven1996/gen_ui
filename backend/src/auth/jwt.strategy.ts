import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@gen-ui/shared';
import { AppConfigService } from '../config/app-config.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { UsersRepository } from '../users/users.repository.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly users: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
      issuer: config.get('JWT_ISSUER'),
      audience: config.get('JWT_AUDIENCE'),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  /**
   * Reload the user on every request so deactivation and role changes apply
   * immediately, not when the access token expires.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user?.isActive) throw new UnauthorizedException();
    return user;
  }
}
