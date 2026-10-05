import { Module } from '@nestjs/common';
import { AlarmsModule } from '../alarms/alarms.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { LogbookModule } from '../logbook/logbook.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiFormsService } from './ai-forms.service.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiTools } from './ai.tools.js';
import { ConversationsService } from './conversations.service.js';

/**
 * The assistant. Import the module of every domain whose service a tool calls
 * (AuditModule is global, but listing it keeps the dependency visible).
 */
@Module({
  imports: [UsersModule, AlarmsModule, LogbookModule, AssetsModule, AuditModule],
  controllers: [AiController],
  providers: [AiService, AiTools, AiFormsService, ConversationsService],
})
export class AiModule {}
