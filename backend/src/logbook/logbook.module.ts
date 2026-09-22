import { Module } from '@nestjs/common';
import { LogbookController } from './logbook.controller.js';
import { LogbookService } from './logbook.service.js';

@Module({
  controllers: [LogbookController],
  providers: [LogbookService],
  exports: [LogbookService],
})
export class LogbookModule {}
