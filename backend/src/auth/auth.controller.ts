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
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  AuthResponseSchema,
  LoginRequestSchema,
  PublicUserSchema,
  type AuthResponse,
  type LoginRequest,
  type PublicUser,
} from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../docs/api-error.js';
import type { ClientMeta } from '../sessions/refresh-token.service.js';
import { toPublicUser, type AuthUser } from '../users/user.mapper.js';
import { AuthService, refreshFailure } from './auth.service.js';
import { RefreshCookieService } from './refresh-cookie.service.js';
import { SameOriginGuard } from './same-origin.guard.js';

const clientMeta = (req: Request): ClientMeta => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
});

const CROSS_ORIGIN = 'The `Origin` header is neither this host nor an allowed CORS origin.';

@ApiTags('Auth')
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
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Returns an access token in the body and sets the refresh cookie. There is no sign-up: accounts are created by an admin at `POST /api/users`.',
  })
  @ApiOkResponse({ description: 'Signed in.', standardSchema: AuthResponseSchema })
  @ApiErrorResponse(400, 'Malformed email, or a missing field.')
  @ApiErrorResponse(401, 'Wrong credentials, or the account is deactivated. `code: INVALID_CREDENTIALS`.')
  @ApiErrorResponse(403, CROSS_ORIGIN)
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
  @ApiCookieAuth('refresh-cookie')
  @ApiOperation({
    summary: 'Rotate the session',
    description:
      'Takes no body: the refresh cookie is the credential. Every call replaces the cookie, and replaying a spent token revokes the whole login.',
  })
  @ApiOkResponse({ description: 'A new token pair.', standardSchema: AuthResponseSchema })
  @ApiErrorResponse(
    401,
    'No cookie, or it is expired, revoked or replayed. `code` is `REFRESH_INVALID`, `REFRESH_RACE` or `REFRESH_REUSED`.',
  )
  @ApiErrorResponse(403, CROSS_ORIGIN)
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
  @ApiCookieAuth('refresh-cookie')
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the presented token family and clears the cookie. Succeeds even without a cookie, so it is safe to call twice.',
  })
  @ApiNoContentResponse({ description: 'Signed out.' })
  @ApiErrorResponse(403, CROSS_ORIGIN)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.cookies.read(req));
    this.cookies.clear(res);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'The signed-in user', description: 'Resolved from the access token.' })
  @ApiOkResponse({ standardSchema: PublicUserSchema })
  @ApiErrorResponse(401, AUTH_REQUIRED)
  me(@CurrentUser() user: AuthUser): PublicUser {
    return toPublicUser(user);
  }
}
