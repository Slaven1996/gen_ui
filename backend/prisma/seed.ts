/**
 * Seed runner. It holds no data of its own: it executes every `.sql` file in
 * `prisma/seed/` in filename order, each one in its own transaction.
 *
 * To seed a new entity, add a file — `002_orders.sql`, `003_invoices.sql` — and
 * write plain INSERTs. Nothing here needs to change.
 *
 * Make each file re-runnable (`ON CONFLICT ... DO NOTHING`, or `WHERE NOT
 * EXISTS`); `pnpm db:seed` is expected to be safe to run more than once.
 *
 * Uses `pg` directly rather than Prisma so the files are ordinary SQL scripts:
 * multiple statements, functions and comments all behave as they would in psql.
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const seedDir = path.join(import.meta.dirname, 'seed');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set (backend/.env).');

const files = (await readdir(seedDir)).filter((name) => name.endsWith('.sql')).sort();
if (files.length === 0) {
  console.log(`No .sql files in ${seedDir} — nothing to seed.`);
  process.exit(0);
}

const client = new Client({ connectionString });
await client.connect();
// The shift plan is laid out in the plant time zone; the SQL reads it back
// with current_setting('app.shift_time_zone', true).
await client.query("SELECT set_config('app.shift_time_zone', $1, false)", [process.env.SHIFT_TIME_ZONE ?? '']);

try {
  for (const file of files) {
    const sql = await readFile(path.join(seedDir, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`  ✔ ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Seed file ${file} failed and was rolled back.`, { cause: error });
    }
  }
  console.log(`Seeded ${files.length} file(s).`);
} finally {
  await client.end();
}
