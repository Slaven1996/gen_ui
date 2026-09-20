import { Module } from '@nestjs/common';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

@Module({
  providers: [RefreshTokenService, RefreshTokenCleanupService],
  exports: [RefreshTokenService],
})
export class SessionsModule {}
