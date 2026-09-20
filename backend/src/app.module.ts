import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { HealthController } from './health/health.controller.js';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ ttl: config.get('THROTTLE_TTL_MS'), limit: config.get('THROTTLE_LIMIT') }],
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guards run in this order: rate limit → authenticate → authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Validates every parameter declared with `{ schema }` (Zod, via Standard Schema).
    { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
    // Nest matches global filters in reverse registration order, so the
    // catch-all must come first to stay the fallback.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
