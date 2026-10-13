import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { LogbookController } from './logbook.controller.js';
import { LogbookService } from './logbook.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [LogbookController],
  providers: [LogbookService],
  exports: [LogbookService],
})
export class LogbookModule {}
