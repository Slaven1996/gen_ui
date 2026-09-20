import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RevokeReason } from '../generated/prisma/client.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/transaction.js';
import { publicUserSelect, type UserRecord } from '../users/user.mapper.js';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedRefreshToken {
  id: string;
  /** Raw token — only ever sent to the client as an httpOnly cookie. */
  token: string;
  expiresAt: Date;
}

export type RotationFailure = 'invalid' | 'expired' | 'inactive' | 'race' | 'reused';

export type RotationResult =
  | { ok: true; refreshToken: IssuedRefreshToken; user: UserRecord }
  | { ok: false; reason: RotationFailure };

/** Thrown inside the rotation transaction to roll back a lost compare-and-set. */
class RotationRaceError extends Error {}

/** 32 random bytes are unguessable, so a fast SHA-256 (indexed lookup) is enough — no bcrypt needed. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Opaque refresh tokens with rotation and reuse detection.
 *
 * Every login starts a token *family*. Each refresh replaces the presented
 * token with a new one in the same family. Presenting an already-rotated
 * token (outside a short grace window for multi-tab races) means the token
 * was copied, so the whole family is revoked.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async issue(
    userId: string,
    meta: ClientMeta,
    familyId: string = randomUUID(),
    db: Db = this.prisma,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000);
    const { id } = await db.refreshToken.create({
      data: {
        tokenHash: hashToken(token),
        familyId,
        userId,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
      },
      select: { id: true },
    });
    return { id, token, expiresAt };
  }

  async rotate(presented: string, meta: ClientMeta): Promise<RotationResult> {
    try {
      return await this.prisma.$transaction((tx) => this.rotateWithin(tx, presented, meta));
    } catch (error) {
      if (error instanceof RotationRaceError) return { ok: false, reason: 'race' };
      throw error;
    }
  }

  /** Logout: revoke every token from the same login. Unknown tokens are ignored. */
  async revokeFamilyOf(presented: string, reason: RevokeReason): Promise<void> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      select: { familyId: true },
    });
    if (token) await this.revokeFamily(this.prisma, token.familyId, reason);
  }

  /** Sign a user out everywhere (deactivation, role change). */
  async revokeAllForUser(userId: string, reason: RevokeReason, db: Db = this.prisma): Promise<void> {
    await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async rotateWithin(tx: Db, presented: string, meta: ClientMeta): Promise<RotationResult> {
    const current = await tx.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      include: { user: { select: publicUserSelect } },
    });
    if (!current) return { ok: false, reason: 'invalid' };

    const now = new Date();

    if (current.revokedAt) {
      if (current.revokedReason !== 'ROTATED') return { ok: false, reason: 'invalid' };

      const graceMs = this.config.get('REFRESH_TOKEN_REUSE_GRACE_SECONDS') * 1000;
      if (now.getTime() - current.revokedAt.getTime() <= graceMs) {
        // Another tab/request rotated this token a moment ago — not an attack.
        return { ok: false, reason: 'race' };
      }

      // Returning (not throwing) commits the revocation.
      await this.revokeFamily(tx, current.familyId, 'REUSE_DETECTED');
      this.logger.warn(
        `Refresh token reuse detected — revoked family ${current.familyId} (user ${current.userId}, ip ${meta.ip ?? 'unknown'})`,
      );
      return { ok: false, reason: 'reused' };
    }

    if (current.expiresAt <= now) return { ok: false, reason: 'expired' };

    if (!current.user.isActive) {
      await this.revokeFamily(tx, current.familyId, 'USER_DISABLED');
      return { ok: false, reason: 'inactive' };
    }

    const next = await this.issue(current.userId, meta, current.familyId, tx);

    // Compare-and-set: a concurrent rotation of the same token loses here and rolls back.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'ROTATED', replacedById: next.id },
    });
    if (count !== 1) throw new RotationRaceError();

    return { ok: true, refreshToken: next, user: current.user };
  }

  private revokeFamily(db: Db, familyId: string, reason: RevokeReason) {
    return db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
