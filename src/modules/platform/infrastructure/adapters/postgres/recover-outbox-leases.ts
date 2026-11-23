import { loadConfig, runApplication } from '@cadenway/nest-common';
import { databaseConfigShape, SystemTransactionRunner } from '@cadenway/nest-common/database';
import pg from 'pg';
import { z } from 'zod';

import { recoverOutboxLeases } from '../../messaging/outbox/leases/outbox-lease-recovery.adapter.js';

await runApplication({ service: 'task-service-outbox-recovery' }, async (): Promise<void> => {
  const config = loadConfig(z.object(databaseConfigShape));
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    application_name: 'task-service-outbox-recovery',
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  });
  try {
    const result = await recoverOutboxLeases(new SystemTransactionRunner(pool));
    console.log(JSON.stringify(result));
    if (result.leasesRemain) process.exitCode = 1;
  } finally {
    await pool.end();
  }
});
