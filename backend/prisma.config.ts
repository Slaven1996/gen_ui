import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/*
 * Prisma is used for its client only. The database schema is created from
 * prisma/init.sql by the Postgres container, not by Prisma migrations, so
 * there is no migrations folder; schema.prisma mirrors init.sql.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
