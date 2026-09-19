import { Module } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service.js';

@Module({
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class SessionsModule {}
