import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MockAlarmNotifier } from './mock-alarm-notifier.service.js';
import { NotificationsCleanupService } from './notifications-cleanup.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Every user's notification inbox, and the socket that pushes new ones to the
 * browser. A module that produces them imports this one, stores them with
 * `NotificationsService.createForActiveUsers` inside its own transaction and
 * calls `push` after the commit.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsGateway, NotificationsService, NotificationsCleanupService, MockAlarmNotifier],
  exports: [NotificationsService],
})
export class NotificationsModule {}
