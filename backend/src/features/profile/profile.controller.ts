import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  AuthResponseSchema,
  ChangePasswordSchema,
  PublicUserSchema,
  UpdateProfileSchema,
  type AuthResponse,
  type ChangePasswordDto,
  type PublicUser,
  type UpdateProfileDto,
} from '@gen-ui/shared';
import { AuthService } from '../auth/auth.service.js';
import { RefreshCookieService } from '../auth/refresh-cookie.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import { toPublicUser, type AuthUser } from '../users/user.mapper.js';
import { ProfileService } from './profile.service.js';

/**
 * The signed-in user's own account. Separate from `/users`, which is the
 * admin-only directory — these routes are for every authenticated role.
 */
@ApiTags('Profile')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly auth: AuthService,
    private readonly cookies: RefreshCookieService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Your account', description: 'The same payload as `/api/auth/me`.' })
  @ApiOkResponse({ standardSchema: PublicUserSchema })
  get(@CurrentUser() user: AuthUser): PublicUser {
    return toPublicUser(user);
  }

  @Patch()
  @ApiOperation({
    summary: 'Edit your account',
    description:
      'Display name only. `email` is the sign-in identifier and changing it needs a verification flow this app does not have; `role` and `isActive` are an admin decision. The schema is strict, so sending any of them is a 400 rather than a silent no-op.',
  })
  @ApiOkResponse({ standardSchema: PublicUserSchema })
  @ApiErrorResponse(400, 'Empty name, or a field that is not yours to change.')
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
  @ApiOperation({
    summary: 'Change your password',
    description:
      'Verifies the current password, then stores the new hash and revokes every refresh token for the account in one transaction. The response carries a replacement token pair and cookie, so the caller stays signed in while every other device is signed out.',
  })
  @ApiOkResponse({
    description: 'Password changed; a fresh session for this client.',
    standardSchema: AuthResponseSchema,
  })
  @ApiErrorResponse(400, 'The new password is under 12 characters, or matches the current one.')
  @ApiErrorResponse(401, `${AUTH_REQUIRED} Also returned when the current password is wrong: \`code: INVALID_CURRENT_PASSWORD\`.`)
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
