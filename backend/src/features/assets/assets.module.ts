import { Module } from '@nestjs/common';
import { LogbookModule } from '../logbook/logbook.module.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';

/** The asset tree, the devices installed on it and the tags (datapoints) they report. */
@Module({
  imports: [LogbookModule],
  controllers: [AssetsController, DevicesController, TagsController],
  providers: [AssetsService, DevicesService, TagsService],
  // Telemetry records device status changes through DevicesService. The assistant reads through all three:
  // the device and tag tools, and the asset tree its prompt lists.
  exports: [AssetsService, DevicesService, TagsService],
})
export class AssetsModule {}
