import { Module } from '@nestjs/common';
import { LogbookModule } from '../logbook/logbook.module.js';
import { AlarmDefinitionsController } from './alarm-definitions.controller.js';
import { AlarmDefinitionsService } from './alarm-definitions.service.js';
import { AlarmEvaluator } from './alarm-evaluator.service.js';
import { AlarmsController } from './alarms.controller.js';
import { AlarmsService } from './alarms.service.js';

@Module({
  imports: [LogbookModule],
  controllers: [AlarmsController, AlarmDefinitionsController],
  providers: [AlarmsService, AlarmDefinitionsService, AlarmEvaluator],
  exports: [AlarmEvaluator],
})
export class AlarmsModule {}
