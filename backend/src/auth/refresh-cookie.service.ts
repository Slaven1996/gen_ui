import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_COOKIE_PATH } from '../common/constants.js';
import { AppConfigService } from '../config/app-config.service.js';
import type { IssuedRefreshToken } from '../sessions/refresh-token.service.js';

/** Reads/writes the refresh token cookie: httpOnly, SameSite=Strict, scoped to /api/auth. */
@Injectable()
export class RefreshCookieService {
  constructor(private readonly config: AppConfigService) {}

  read(req: Request): string | undefined {
    const value: unknown = req.cookies?.[this.name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  set(res: Response, refreshToken: IssuedRefreshToken): void {
    res.cookie(this.name, refreshToken.token, {
      ...this.options(),
      expires: refreshToken.expiresAt,
    });
  }

  clear(res: Response): void {
    // Must match the attributes used when setting, or browsers keep the cookie.
    res.clearCookie(this.name, this.options());
  }

  private get name(): string {
    return this.config.get('REFRESH_COOKIE_NAME');
  }

  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      domain: this.config.get('COOKIE_DOMAIN'),
    };
  }
}
