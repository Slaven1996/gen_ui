import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelemetryService } from './telemetry.service.js';

interface SimulatedTag {
  id: string;
  code: string;
  dataType: 'ANALOG' | 'DIGITAL' | 'COUNTER';
  minValue: number | null;
  maxValue: number | null;
  lastValue: number | null;
}

const FAULT_CODE = /FAULT|TRIP|ALARM|INTRUSION/i;

/** A stable 0..1 number per tag, so each tag gets its own daily rhythm. */
function phaseOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 1000) / 1000;
}

/**
 * The next reading: a daily sine around mid-range plus a random walk. Now and
 * then an excursion to the top or bottom of the range, which is what makes the
 * seeded alarm rules fire (and clear again a few readings later).
 */
export function nextValue(tag: SimulatedTag, now: Date, random = Math.random): number {
  const min = tag.minValue ?? 0;
  const max = tag.maxValue ?? 100;
  const span = max - min || 1;

  switch (tag.dataType) {
    case 'DIGITAL': {
      const previous = Math.round(tag.lastValue ?? 0);
      // Fault bits trip rarely and reset soon; status bits (pump running…) toggle now and then.
      const flip = FAULT_CODE.test(tag.code) ? (previous === 0 ? 0.002 : 0.1) : 0.01;
      return random() < flip ? 1 - previous : previous;
    }
    case 'COUNTER':
      return Math.round(((tag.lastValue ?? 0) + random() * span * 0.002) * 100) / 100;
    case 'ANALOG': {
      const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
      const target = min + span * (0.5 + 0.2 * Math.sin(2 * Math.PI * (hours / 24 + phaseOf(tag.id))));
      const previous = tag.lastValue ?? target;
      let value = previous + (target - previous) * 0.15 + (random() - 0.5) * span * 0.03;
      const excursion = random();
      if (excursion < 0.0015) value = max - span * 0.02 * random();
      else if (excursion < 0.0025) value = min + span * 0.02 * random();
      value = Math.min(max + span * 0.05, Math.max(min - span * 0.05, value));
      return Math.round(value * 1000) / 1000;
    }
  }
}

@Injectable()
export class TelemetrySimulator implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelemetrySimulator.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
    private readonly config: AppConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('SIMULATOR_ENABLED')) return;
    const seconds = this.config.get('SIMULATOR_INTERVAL_SECONDS');
    this.scheduler.addInterval('telemetry-simulator', setInterval(() => void this.tick(), seconds * 1000));
    this.logger.log(`Simulating readings every ${seconds}s (SIMULATOR_ENABLED=false to stop)`);
  }

  async tick(): Promise<void> {
    // A slow database must not stack ticks on top of each other.
    if (this.running) return;
    this.running = true;
    try {
      const tags = await this.prisma.tag.findMany({
        where: { isActive: true, device: { status: 'ONLINE' } },
        select: { id: true, code: true, dataType: true, minValue: true, maxValue: true, lastValue: true },
      });
      if (tags.length === 0) return;

      const now = new Date();
      const result = await this.telemetry.ingest({
        measurements: tags.map((tag) => ({
          tagId: tag.id,
          ts: now.toISOString(),
          value: nextValue(tag, now),
          quality: 'GOOD' as const,
        })),
      });
      if (result.alarmsRaised || result.alarmsCleared) {
        this.logger.log(`Simulated readings raised ${result.alarmsRaised} and cleared ${result.alarmsCleared} alarm(s)`);
      }
    } catch (error) {
      this.logger.warn(`Simulator tick failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** Keeps `measurements` from growing without bound. Idempotent, safe on every instance. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'prune-measurements' })
  async prune(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.get('TELEMETRY_RETENTION_DAYS') * 86_400_000);
    try {
      const { count } = await this.prisma.measurement.deleteMany({ where: { ts: { lt: cutoff } } });
      if (count > 0) this.logger.log(`Pruned ${count} measurement(s) older than ${cutoff.toISOString()}`);
      return count;
    } catch (error) {
      this.logger.error('Measurement prune failed', error instanceof Error ? error.stack : String(error));
      return 0;
    }
  }
}
