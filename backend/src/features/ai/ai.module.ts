import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiTools } from './ai.tools.js';
import { ConversationsService } from './conversations.service.js';

/** The assistant. Import the module of every domain whose service a tool calls. */
@Module({
  imports: [UsersModule],
  controllers: [AiController],
  providers: [AiService, AiTools, ConversationsService],
})
export class AiModule {}
