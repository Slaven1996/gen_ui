import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModule } from './ai/ai.module.js';
import { AlarmsModule } from './alarms/alarms.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AssetsModule } from './assets/assets.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DashboardsModule } from './dashboards/dashboards.module.js';
import { HealthController } from './health/health.controller.js';
import { LogbookModule } from './logbook/logbook.module.js';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { ShiftsModule } from './shifts/shifts.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ProfileModule,
    AssetsModule,
    TelemetryModule,
    AlarmsModule,
    LogbookModule,
    ShiftsModule,
    AnalyticsModule,
    DashboardsModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guards run in this order: authenticate → authorize.
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
