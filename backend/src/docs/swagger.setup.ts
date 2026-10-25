import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX, DOCS_PATH, REFRESH_COOKIE_PATH } from '../common/constants.js';
import { AppConfigService } from '../config/app-config.service.js';

const DESCRIPTION = `
The API behind the Hydro Telemetry dashboard. Everything lives under \`/${API_PREFIX}\`.

### Signing in

\`POST /${API_PREFIX}/auth/login\` returns a short-lived **access token** in the
body and sets an httpOnly **refresh cookie** scoped to \`${REFRESH_COOKIE_PATH}\`.
Send the access token as \`Authorization: Bearer <token>\` on every other route;
when it expires, \`POST /${API_PREFIX}/auth/refresh\` exchanges the cookie for a
new pair. The refresh token rotates on every use, and replaying an old one
revokes the whole login.

To try a route here: call **login**, copy \`accessToken\` from the response, then
press **Authorize** and paste it. The refresh cookie is handled by the browser,
so \`refresh\` and \`logout\` work without any extra setup.

The seeded demo accounts all use the password \`Password123!\` — start with
\`admin@example.com\`, which is the only role that may reach \`/${API_PREFIX}/users\`.

### Lists

Every list endpoint takes the same kind of query: \`page\` and \`pageSize\`,
\`sort\` (one field, \`-\` prefix for descending, e.g. \`sort=-raisedAt\`),
comma-separated multi-value filters (\`state=ACTIVE,ACKNOWLEDGED\`), a time
window as \`range=24h\` (relative to now) or \`from\`/\`to\` (ISO 8601), and
\`search\`. \`assetId\` filters include everything below that asset. The web
app uses exactly these parameters in its own URLs, so a page URL can be
turned into an API call by swapping the path.

### Errors

Every failure comes back in one envelope: \`statusCode\`, \`message\`,
\`timestamp\` and \`path\`, plus a machine-readable \`code\` on auth and password
errors. Validation failures return \`message\` as one string per rejected field.
`.trim();

export function setupSwagger(app: INestApplication): void {
  const config = app.get(AppConfigService);

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Hydro Telemetry API')
      .setDescription(DESCRIPTION)
      .setVersion('0.1.0')
      .addServer('/', 'Same origin as the web app')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'The `accessToken` from /auth/login.' },
        'access-token',
      )
      .addCookieAuth(
        config.get('REFRESH_COOKIE_NAME'),
        { type: 'apiKey', description: 'Set by /auth/login. httpOnly, so the browser sends it for you.' },
        'refresh-cookie',
      )
      .addTag('Auth', 'Signing in, rotating tokens, signing out')
      .addTag('Profile', 'The signed-in user’s own account')
      .addTag('Users', 'Admin-only user directory')
      .addTag('Assets', 'The asset tree: regions, sites, areas, equipment')
      .addTag('Devices', 'RTUs, PLCs and sensors installed on assets')
      .addTag('Tags', 'Datapoints the devices report, with their latest value')
      .addTag('Telemetry', 'Time series, statistics and ingestion')
      .addTag('Alarms', 'The alarm console: list, acknowledge, clear')
      .addTag('Alarm rules', 'Threshold rules evaluated on every reading')
      .addTag('Logbook', 'Operator notes and system events')
      .addTag('Audit log', 'Admin-only trail of who changed what')
      .addTag('Shifts', 'Shift templates, schedules and who is on duty')
      .addTag('Analytics', 'KPIs, alarm trends and frequent alarms')
      .addTag('Dashboards', 'Customizable dashboards and their widgets')
      .addTag('Notifications', 'Your notification inbox: alarms as they are raised')
      .addTag('Assistant', 'The Generative UI chat and your saved chats')
      .addTag('Health', 'Liveness and readiness probes')
      .build(),
  );

  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
    yamlDocumentUrl: `${DOCS_PATH}/openapi.yaml`,
    customSiteTitle: 'Hydro Telemetry API docs',
    swaggerOptions: {
      // Keep the pasted access token across reloads, and send the refresh
      // cookie on "Try it out" so /auth/refresh and /auth/logout work.
      persistAuthorization: true,
      withCredentials: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      tagsSorter: 'alpha',
    },
  });
}
