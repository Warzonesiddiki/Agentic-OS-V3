/**
 * drizzle.config.ts — Drizzle Kit configuration for both SQLite and PostgreSQL.
 *
 * SQLite:  `npx drizzle-kit generate --config drizzle.config.ts`
 *          `npx drizzle-kit push --config drizzle.config.ts`
 * Postgres: `DATABASE_URL=postgres://... npx drizzle-kit push --config drizzle.config.ts`
 *
 * We keep both schemas in one config; the CLI uses the `dialect` setting.
 */

import type { Config } from 'drizzle-kit';

export default {
  schema: ['./src/db/schema-sqlite.ts', './src/db/schema.ts'],
  out: './drizzle',
  dialect: 'sqlite', // default; override via --dialect for postgres
  dbCredentials: {
    url: './agentic-os.db',
  },
  verbose: true,
  strict: true,
} satisfies Config;
