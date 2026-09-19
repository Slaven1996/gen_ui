import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUTH_ERROR_CODES, type AuthResponse, type LoginRequest } from '@gen-ui/shared';
import { AppConfigService } from '../config/app-config.service.js';
import {
  RefreshTokenService,
  type ClientMeta,
  type IssuedRefreshToken,
  type RotationFailure,
} from '../sessions/refresh-token.service.js';
import { PasswordService } from '../users/password.service.js';
import { toPublicUser, type UserRecord } from '../users/user.mapper.js';
import { UsersRepository } from '../users/users.repository.js';
import type { AccessTokenPayload } from './jwt.strategy.js';

export interface SessionGrant {
  body: AuthResponse;
  refreshToken: IssuedRefreshToken;
}

export type RefreshOutcome = ({ ok: true } & SessionGrant) | { ok: false; reason: RotationFailure };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async login(credentials: LoginRequest, meta: ClientMeta): Promise<SessionGrant> {
    const account = await this.users.findByEmailForLogin(credentials.email);
    if (!account) {
      await this.passwords.verifyAgainstDummy(credentials.password);
      throw invalidCredentials();
    }

    const valid = await this.passwords.verify(account.passwordHash, credentials.password);
    if (!valid || !account.isActive) throw invalidCredentials();

    const user = await this.users.update(account.id, { lastLoginAt: new Date() });
    const refreshToken = await this.refreshTokens.issue(user.id, meta);
    return { body: await this.buildAuthResponse(user), refreshToken };
  }

  async refresh(presented: string, meta: ClientMeta): Promise<RefreshOutcome> {
    const result = await this.refreshTokens.rotate(presented, meta);
    if (!result.ok) return result;
    return {
      ok: true,
      body: await this.buildAuthResponse(result.user),
      refreshToken: result.refreshToken,
    };
  }

  async logout(presented: string | undefined): Promise<void> {
    if (presented) await this.refreshTokens.revokeFamilyOf(presented, 'LOGOUT');
  }

  private async buildAuthResponse(user: UserRecord): Promise<AuthResponse> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
      user: toPublicUser(user),
    };
  }
}

function invalidCredentials() {
  return new UnauthorizedException({
    statusCode: 401,
    message: 'Invalid email or password',
    code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
  });
}

export function refreshFailure(reason: RotationFailure) {
  const code =
    reason === 'race'
      ? AUTH_ERROR_CODES.REFRESH_RACE
      : reason === 'reused'
        ? AUTH_ERROR_CODES.REFRESH_REUSED
        : AUTH_ERROR_CODES.REFRESH_INVALID;
  return new UnauthorizedException({ statusCode: 401, message: 'Session is no longer valid', code });
}
