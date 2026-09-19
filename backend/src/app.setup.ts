import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { API_PREFIX } from './common/constants.js';
import { AppConfigService } from './config/app-config.service.js';

/** HTTP-level setup shared by `main.ts` and the e2e tests. */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get(AppConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.set('trust proxy', config.get('TRUST_PROXY'));
  app.use(helmet());
  app.use(cookieParser());
  // Chat requests carry the whole conversation; Express' default is 100kb.
  app.useBodyParser('json', { limit: '2mb' });

  const origins = config.get('CORS_ORIGIN');
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }

  app.enableShutdownHooks();
  return app;
}
