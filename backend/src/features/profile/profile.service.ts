import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PROFILE_ERROR_CODES, type ChangePasswordDto, type PublicUser, type UpdateProfileDto } from '@gen-ui/shared';
import { AuditService } from '../audit/audit.service.js';
import { UnitOfWork } from '../../prisma/unit-of-work.service.js';
import { RefreshTokenService } from '../sessions/refresh-token.service.js';
import { PasswordService } from '../users/password.service.js';
import { toPublicUser, type AuthUser, type UserRecord } from '../users/user.mapper.js';
import { UsersRepository } from '../users/users.repository.js';

/** What a user may change about their own account. */
@Injectable()
export class ProfileService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async update(actor: AuthUser, dto: UpdateProfileDto): Promise<PublicUser> {
    const updated = await this.users.update(actor.id, { name: dto.name });
    return toPublicUser(updated);
  }

  /**
   * Verifies the current password before storing the new one, then revokes
   * every refresh token the account has — a password change must end any
   * session someone else may be holding. The caller issues a replacement
   * session so the tab that made the change stays signed in.
   */
  async changePassword(actor: AuthUser, dto: ChangePasswordDto): Promise<UserRecord> {
    const account = await this.users.findCredentialsById(actor.id);
    if (!account) throw invalidCurrentPassword();

    const valid = await this.passwords.verify(account.passwordHash, dto.currentPassword);
    if (!valid) throw invalidCurrentPassword();

    const passwordHash = await this.passwords.hash(dto.newPassword);

    // Atomic: the new hash and the revocation must land together, or a crash
    // could change the password while old sessions keep working.
    return this.uow.run(async (tx) => {
      const updated = await this.users.updatePasswordHash(actor.id, passwordHash, tx);
      await this.refreshTokens.revokeAllForUser(actor.id, 'PASSWORD_CHANGED', tx);
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.password_change',
          entityType: 'USER',
          entityId: actor.id,
          summary: `${actor.name} changed their password; other sessions were signed out`,
        },
        tx,
      );
      return updated;
    });
  }
}

/** Deliberately identical whether the account vanished or the password was wrong. */
function invalidCurrentPassword() {
  return new UnauthorizedException({
    statusCode: 401,
    message: 'Your current password is not correct',
    code: PROFILE_ERROR_CODES.INVALID_CURRENT_PASSWORD,
  });
}
