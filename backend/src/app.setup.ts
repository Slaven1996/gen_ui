import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { API_PREFIX, DOCS_PATH } from './common/constants.js';
import { AppConfigService } from './config/app-config.service.js';

/** HTTP-level setup shared by `main.ts` and the e2e tests. */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get(AppConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.set('trust proxy', config.get('TRUST_PROXY'));
  app.use(securityHeaders());
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

/**
 * Helmet's defaults everywhere, with two exceptions for the Swagger UI page —
 * the only HTML this process serves. Its markup carries an inline `<style>`
 * block, and `upgrade-insecure-requests` would rewrite its asset URLs to
 * https:// whenever the docs are opened over plain http on anything but
 * localhost. The JSON API keeps the stricter defaults.
 */
function securityHeaders() {
  const forApi = helmet();
  const forDocs = helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'style-src': ["'self'", "'unsafe-inline'"],
        'upgrade-insecure-requests': null,
      },
    },
  });

  return (req: Request, res: Response, next: NextFunction) =>
    (req.path === `/${DOCS_PATH}` || req.path.startsWith(`/${DOCS_PATH}/`) ? forDocs : forApi)(
      req,
      res,
      next,
    );
}
