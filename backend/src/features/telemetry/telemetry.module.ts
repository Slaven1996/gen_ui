import { Module } from '@nestjs/common';
import { AlarmsModule } from '../alarms/alarms.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { TelemetrySimulator } from './telemetry-simulator.service.js';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryService } from './telemetry.service.js';

@Module({
  imports: [AlarmsModule, AssetsModule],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetrySimulator],
  exports: [TelemetryService],
})
export class TelemetryModule {}
