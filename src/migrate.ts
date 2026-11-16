import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@cadenway/nest-common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { migrationConfigSchema } from './config/app-config.js';
import type { MigrationConfig } from './config/app-config.js';

// Entry point of the one-off migration container (`node dist/migrate.js`), which the GitOps agent of
// cadenway-ops runs before it starts a new version. drizzle-kit is a development dependency and is
// not in the production image, so the migrations are applied with the runtime migrator.
//
// They run as the migrator role of MIGRATION_DATABASE_URL, which owns the tables: the application
// role of DATABASE_URL holds no DDL right and would be refused. The variable is validated only when
// there is something to apply, and a missing or malformed one stops the container with a
// ConfigError that names it.
/**
 * Constant migrationsFolder
 *
 * @description
 * Location of the migration files included in the service image.
 *
 * @type {string}
 */
const migrationsFolder: string = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Completes the index and validation of the lease expansion outside Drizzle's transaction.
 *
 * @param {pg.PoolClient} client - The migration connection holding the advisory lock.
 * @returns {Promise<void>} Resolves when the index and both constraints are ready.
 */
async function completeOutboxLeaseExpansion(client: pg.PoolClient): Promise<void> {
  const index: pg.QueryResult<{ indisvalid: boolean }> = await client.query(
    `SELECT indisvalid FROM pg_index
     WHERE indexrelid = to_regclass('public.outbox_events_lease_expiry_index')`,
  );
  if (index.rows[0]?.indisvalid === false) {
    await client.query('DROP INDEX CONCURRENTLY public.outbox_events_lease_expiry_index');
  }
  if (index.rows[0]?.indisvalid !== true) {
    await client.query(
      `CREATE INDEX CONCURRENTLY outbox_events_lease_expiry_index
       ON public.outbox_events (lease_expires_at, id) WHERE status = 'leased'`,
    );
  }
  await client.query(
    `ALTER TABLE public.outbox_events
       VALIDATE CONSTRAINT outbox_events_status_check,
       VALIDATE CONSTRAINT outbox_events_lease_check`,
  );
}

if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
  console.log('No migration has been generated yet: nothing to apply.');
} else {
  const migration: Readonly<MigrationConfig> = loadConfig(migrationConfigSchema);
  const pool: pg.Pool = new pg.Pool({
    connectionString: migration.MIGRATION_DATABASE_URL,
    application_name: 'task-service-migrator',
  });
  try {
    const client: pg.PoolClient = await pool.connect();
    try {
      // One session owns the expansion across the transactional and concurrent DDL phases.
      await client.query("SELECT pg_advisory_lock(hashtextextended('task-service-migrations', 0))");
      await migrate(drizzle({ client }), { migrationsFolder });
      await completeOutboxLeaseExpansion(client);
      console.log('Migrations applied.');
    } finally {
      // Destroy the session, including any advisory lock, even after a failed statement.
      client.release(true);
    }
  } finally {
    await pool.end();
  }
}
