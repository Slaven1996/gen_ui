import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { aiLanguageModelProvider } from './ai-provider.factory.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { GenUiToolsFactory } from './tools/gen-ui-tools.factory.js';

@Module({
  imports: [UsersModule],
  controllers: [AiController],
  providers: [AiService, GenUiToolsFactory, aiLanguageModelProvider],
})
export class AiModule {}
