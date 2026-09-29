import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MockAlarmNotifier } from './mock-alarm-notifier.service.js';
import { NotificationsGateway } from './notifications.gateway.js';

/**
 * Pushes notifications to the browser over WebSockets. A module that
 * produces them imports this one and calls `NotificationsGateway.broadcast`.
 */
@Module({
  imports: [AuthModule],
  providers: [NotificationsGateway, MockAlarmNotifier],
  exports: [NotificationsGateway],
})
export class NotificationsModule {}
