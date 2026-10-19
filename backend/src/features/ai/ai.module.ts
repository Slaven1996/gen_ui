import { Module } from '@nestjs/common';
import { AlarmsModule } from '../alarms/alarms.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DashboardsModule } from '../dashboards/dashboards.module.js';
import { LogbookModule } from '../logbook/logbook.module.js';
import { ShiftsModule } from '../shifts/shifts.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiFormsService } from './ai-forms.service.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiTools } from './ai.tools.js';
import { ConversationsService } from './conversations.service.js';
import { DashboardDraftsService } from './dashboard-drafts.service.js';

/**
 * The assistant. Import the module of every domain whose service a tool calls
 * (AuditModule is global, but listing it keeps the dependency visible).
 * DashboardsModule tells which dashboard drafts were saved.
 */
@Module({
  imports: [
    UsersModule,
    AlarmsModule,
    LogbookModule,
    AssetsModule,
    TelemetryModule,
    ShiftsModule,
    AuditModule,
    DashboardsModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiTools, AiFormsService, ConversationsService, DashboardDraftsService],
})
export class AiModule {}
