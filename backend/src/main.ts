import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { DOCS_PATH } from './common/constants.js';
import { AppConfigService } from './config/app-config.service.js';
import { setupSwagger } from './docs/swagger.setup.js';

async function bootstrap() {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule));
  // After configureApp: the generated paths pick up the global prefix.
  setupSwagger(app);

  const port = app.get(AppConfigService).get('PORT');
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}/api`);
  logger.log(`API docs on http://localhost:${port}/${DOCS_PATH}`);
}
await bootstrap();
