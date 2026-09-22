import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service.js';

/**
 * Defence in depth for the cookie-authenticated auth endpoints (on top of
 * SameSite=Strict): a browser `Origin` must be this host or an allowed CORS
 * origin. Requests without `Origin` (curl, server-to-server) are allowed —
 * browsers always send it on POST.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin = req.get('origin');
    if (!origin) return true;
    if (this.config.get('CORS_ORIGIN').includes(origin)) return true;

    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ForbiddenException('Invalid Origin header');
    }
    // `req.host` honours X-Forwarded-Host when TRUST_PROXY is enabled.
    if (originHost === req.host) return true;

    throw new ForbiddenException('Cross-origin request rejected');
  }
}
