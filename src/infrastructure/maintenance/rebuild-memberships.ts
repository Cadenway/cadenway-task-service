import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { loadConfig, runApplication } from '@cadenway/nest-common';
import { databaseConfigShape } from '@cadenway/nest-common/database';
import { z } from 'zod';

import { rebuildTaskMemberships } from '../../app.module.js';

/** Targets only the Ops restore candidate on the already configured PostgreSQL server. */
function databaseUrl(connectionString: string, arguments_: readonly string[]): string {
  if (arguments_.length === 0) return connectionString;
  const [option, name] = arguments_;
  if (
    arguments_.length !== 2 ||
    option !== '--database' ||
    name === undefined ||
    !/^cw_restore_candidate_task_[A-Za-z0-9]{8}$/u.test(name)
  ) {
    throw new Error('Expected --database followed by an Ops Task restore candidate name.');
  }
  const target = new URL(connectionString);
  if (target.searchParams.has('database') || target.searchParams.has('dbname')) {
    throw new Error('Configure the Task database in the DATABASE_URL path.');
  }
  target.pathname = `/${name}`;
  return target.href;
}

// Stage the input privately and verify the entire stream before the first membership write.
// The Task runtime stays stopped until Ops activates the candidate. No broker is used here.
await runApplication({ service: 'task-service' }, async () => {
  const config = loadConfig(z.object(databaseConfigShape));
  const target = databaseUrl(config.DATABASE_URL, process.argv.slice(2));
  const workspace = await mkdtemp(join(tmpdir(), 'cadenway-membership-rebuild-'));
  try {
    const spool = join(workspace, 'memberships.ndjson');
    await pipeline(process.stdin, createWriteStream(spool, { flags: 'wx', mode: 0o600 }));
    const count = await rebuildTaskMemberships({ ...config, DATABASE_URL: target }, spool);
    process.stderr.write(`Task membership rebuild applied ${String(count)} observations.\n`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
