import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AiModule } from './features/ai/ai.module.js';
import { AlarmsModule } from './features/alarms/alarms.module.js';
import { AnalyticsModule } from './features/analytics/analytics.module.js';
import { AssetsModule } from './features/assets/assets.module.js';
import { AuditModule } from './features/audit/audit.module.js';
import { AuthModule } from './features/auth/auth.module.js';
import { JwtAuthGuard } from './features/auth/jwt-auth.guard.js';
import { RolesGuard } from './features/auth/roles.guard.js';
import { DashboardsModule } from './features/dashboards/dashboards.module.js';
import { HealthController } from './features/health/health.controller.js';
import { LogbookModule } from './features/logbook/logbook.module.js';
import { NotificationsModule } from './features/notifications/notifications.module.js';
import { ProfileModule } from './features/profile/profile.module.js';
import { ShiftsModule } from './features/shifts/shifts.module.js';
import { TelemetryModule } from './features/telemetry/telemetry.module.js';
import { UsersModule } from './features/users/users.module.js';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter.js';
import { PrismaModule } from './prisma/prisma.module.js';

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
    NotificationsModule,
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
