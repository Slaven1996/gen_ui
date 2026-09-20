import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ChangePasswordSchema,
  UpdateProfileSchema,
  type AuthResponse,
  type ChangePasswordDto,
  type PublicUser,
  type UpdateProfileDto,
} from '@gen-ui/shared';
import { AuthService } from '../auth/auth.service.js';
import { RefreshCookieService } from '../auth/refresh-cookie.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { toPublicUser, type AuthUser } from '../users/user.mapper.js';
import { ProfileService } from './profile.service.js';

/**
 * The signed-in user's own account. Separate from `/users`, which is the
 * admin-only directory — these routes are for every authenticated role.
 */
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly auth: AuthService,
    private readonly cookies: RefreshCookieService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthUser): PublicUser {
    return toPublicUser(user);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body({ schema: UpdateProfileSchema }) dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.profile.update(user, dto);
  }

  /**
   * Changing the password signs every *other* session out. This tab gets a
   * fresh token pair in the response so it stays signed in.
   */
  @Post('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body({ schema: ChangePasswordSchema }) dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const updated = await this.profile.changePassword(user, dto);

    const { body, refreshToken } = await this.auth.startFreshSession(updated, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    this.cookies.set(res, refreshToken);
    return body;
  }
}
