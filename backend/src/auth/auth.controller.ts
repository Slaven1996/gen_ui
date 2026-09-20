import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  LoginRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type PublicUser,
} from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { ClientMeta } from '../sessions/refresh-token.service.js';
import { toPublicUser, type AuthUser } from '../users/user.mapper.js';
import { AuthService, refreshFailure } from './auth.service.js';
import { RefreshCookieService } from './refresh-cookie.service.js';
import { SameOriginGuard } from './same-origin.guard.js';

const clientMeta = (req: Request): ClientMeta => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: RefreshCookieService,
  ) {}

  @Public()
  @UseGuards(SameOriginGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body({ schema: LoginRequestSchema }) credentials: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { body, refreshToken } = await this.auth.login(credentials, clientMeta(req));
    this.cookies.set(res, refreshToken);
    return body;
  }

  /** Rotates the refresh cookie and returns a fresh in-memory access token. */
  @Public()
  @UseGuards(SameOriginGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    const presented = this.cookies.read(req);
    if (!presented) throw refreshFailure('invalid');

    const outcome = await this.auth.refresh(presented, clientMeta(req));
    if (!outcome.ok) {
      // On a benign race the winning request has already set the replacement
      // cookie — clearing here would log the user out.
      if (outcome.reason !== 'race') this.cookies.clear(res);
      throw refreshFailure(outcome.reason);
    }

    this.cookies.set(res, outcome.refreshToken);
    return outcome.body;
  }

  @Public()
  @UseGuards(SameOriginGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.cookies.read(req));
    this.cookies.clear(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): PublicUser {
    return toPublicUser(user);
  }
}
