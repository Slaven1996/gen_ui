import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ALARM_SEVERITIES, type AppNotification } from '@gen-ui/shared';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatReading } from '../alarms/alarm.mapper.js';
import { assetRefSelect } from '../assets/asset.mapper.js';
import { NotificationsGateway } from './notifications.gateway.js';

const EVERY_MS = 60_000;
/** Chance that a tick pushes an alarm: 40% do, 60% stay quiet. */
const CHANCE = 0.4;

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/**
 * TEMPORARY — stands in for real alarm notifications, to show the socket at
 * work. Every 60 s it rolls the dice (`Math.random() < 0.4`); 40% of the time it
 * makes up an alarm on a random analog tag and pushes it to every connected tab.
 * Nothing is written to the database, so a demo alarm has no page of its own
 * (`demo: true`, `alarmId: null`).
 *
 * To retire it: have the alarm evaluator call `NotificationsGateway.broadcast`
 * for each alarm it raises (after its transaction commits), then delete this
 * file and its line in notifications.module.ts. Until then,
 * MOCK_ALARM_NOTIFICATIONS=false switches it off.
 */
@Injectable()
export class MockAlarmNotifier implements OnApplicationBootstrap {
  private readonly logger = new Logger(MockAlarmNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly config: AppConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('MOCK_ALARM_NOTIFICATIONS')) return;
    this.scheduler.addInterval('mock-alarm-notifications', setInterval(() => void this.tick(), EVERY_MS));
    this.logger.log('Pushing a demo alarm notification every 60 s, 40% of the time (MOCK_ALARM_NOTIFICATIONS=false to stop)');
  }

  async tick(): Promise<void> {
    if (!(Math.random() < CHANCE) || !this.gateway.hasListeners()) return;
    try {
      const notification = await this.makeUpAlarm();
      if (notification) this.gateway.broadcast(notification);
    } catch (error) {
      this.logger.warn(`Demo notification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** "Wet well level high: above 4.5 m (4.62 m)" on a real tag, so the asset link works. */
  private async makeUpAlarm(): Promise<AppNotification | null> {
    const where = { isActive: true, dataType: 'ANALOG' as const };
    const count = await this.prisma.tag.count({ where });
    if (count === 0) return null;
    const tag = await this.prisma.tag.findFirst({
      where,
      orderBy: { id: 'asc' },
      skip: Math.floor(Math.random() * count),
      select: {
        name: true,
        unit: true,
        minValue: true,
        maxValue: true,
        device: { select: { asset: { select: assetRefSelect } } },
      },
    });
    if (!tag) return null;

    const min = tag.minValue ?? 0;
    const max = tag.maxValue ?? 100;
    const span = max - min || 1;
    const high = Math.random() < 0.5;
    const limit = high ? max - span * 0.1 : min + span * 0.1;
    const value = limit + (high ? 1 : -1) * span * 0.05 * Math.random();

    return {
      id: randomUUID(),
      type: 'ALARM',
      severity: pick(ALARM_SEVERITIES),
      title: `${tag.name} ${high ? 'high' : 'low'}`,
      message: `${tag.name} ${high ? 'above' : 'below'} ${formatReading(limit, tag.unit)} (${formatReading(value, tag.unit)})`,
      asset: tag.device.asset,
      alarmId: null,
      demo: true,
      createdAt: new Date().toISOString(),
    };
  }
}
