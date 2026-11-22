import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '@cadenway/nest-common';
import { databaseConfigShape } from '@cadenway/nest-common/database';
import { provisionJobs } from '@cadenway/nest-jobs/provisioning';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { rebuildTaskMemberships } from '../src/app.module.js';
import { CLEAN_UP_REMOVED_MEMBER_QUEUE, jobQueues } from '../src/config/job-queues.js';
import { DEFAULT_SPACE_STATUSES } from '../src/modules/spaces/domain/value-objects/status/space-statuses.value-object.js';

const project = `cadenway-task-membership-rebuild-${String(process.pid)}`;
const organizationId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const ownerId = '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24';
const formerGuestId = '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c25';
const ownerMembership = '01938f6e-9000-7000-8000-0000000000c1';
const formerMembership = '01938f6e-9000-7000-8000-0000000000c2';
const time = '2026-06-01T10:00:00.000Z';

function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', '-p', project, '-f', 'compose.dev.yaml', ...args], {
    env: { ...process.env, DEV_POSTGRES_PORT: '0' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const memberships = [
  { memberId: ownerMembership, userId: ownerId, role: 'owner', version: 1, removedAt: null },
  { memberId: formerMembership, userId: formerGuestId, role: 'guest', version: 2, removedAt: time },
];

function snapshot(complete: boolean): string {
  const lines = [
    JSON.stringify({ kind: 'header', version: 1 }),
    ...memberships.map((item) =>
      JSON.stringify({ kind: 'membership', organizationId, updatedAt: time, ...item }),
    ),
  ];
  if (complete) lines.push(JSON.stringify({ kind: 'footer', count: memberships.length }));
  return lines.join('\n') + '\n';
}

describe('Offline Task membership rebuild', () => {
  let workspace: string | undefined;
  let admin: pg.Pool | undefined;
  let port: string;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'task-rebuild-test-'));
    compose('up', '-d', '--wait', 'postgres');
    port = compose('port', 'postgres', '5432').trim().split(':').at(-1) ?? '';
    const migrationUrl = `postgres://task_migrator:task_migrator@127.0.0.1:${port}/task`;
    const migrator = new pg.Pool({ connectionString: migrationUrl });
    try {
      await migrate(drizzle({ client: migrator }), { migrationsFolder: 'migrations' });
    } finally {
      await migrator.end();
    }
    await provisionJobs({
      connection: { connectionString: migrationUrl },
      appRole: 'task_app',
      queues: jobQueues,
    });
    admin = new pg.Pool({
      connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/task`,
    });
  });

  afterAll(async () => {
    await admin?.end();
    compose('down', '--volumes');
    if (workspace !== undefined) await rm(workspace, { recursive: true, force: true });
  });

  it('applies tombstones, records side effects and never consumes NATS while offline', async () => {
    if (workspace === undefined || admin === undefined)
      throw new Error('PostgreSQL was not started.');
    const adminDb = admin;
    const config = loadConfig(z.object(databaseConfigShape), {
      DATABASE_URL: `postgres://task_app:task_app@127.0.0.1:${port}/task`,
    });
    const spool = join(workspace, 'snapshot.ndjson');
    await admin.query(
      `insert into organization_members (organization_id, id, user_id, role, version)
       values ($1, $2, $3, 'guest', 1)`,
      [organizationId, formerMembership, formerGuestId],
    );
    await admin.query(
      `insert into spaces (organization_id, name, prefix, color, visibility, owner_user_id, statuses, awaiting_owner)
       values ($1, 'Design', 'DSN', 'violet', 'private', $2, $3, true)`,
      [organizationId, formerGuestId, JSON.stringify(DEFAULT_SPACE_STATUSES)],
    );
    const readProjection = (): Promise<pg.QueryResult> =>
      adminDb.query(
        'select id, role, version::int, removed_at from organization_members order by id',
      );

    await writeFile(spool, snapshot(false));
    await expect(rebuildTaskMemberships(config, spool)).rejects.toThrow('Invalid or incomplete');
    expect((await readProjection()).rows).toEqual([
      { id: formerMembership, role: 'guest', version: 1, removed_at: null },
    ]);

    await writeFile(spool, snapshot(true));
    await expect(rebuildTaskMemberships(config, spool)).resolves.toBe(2);
    await expect(rebuildTaskMemberships(config, spool)).resolves.toBe(2);
    expect((await readProjection()).rows).toEqual([
      { id: ownerMembership, role: 'owner', version: 1, removed_at: null },
      { id: formerMembership, role: 'guest', version: 2, removed_at: new Date(time) },
    ]);
    const space = await admin.query('select owner_user_id, awaiting_owner from spaces');
    expect(space.rows).toEqual([{ owner_user_id: formerGuestId, awaiting_owner: true }]);
    const outbox = await admin.query<{ count: number }>('select count(*)::int from outbox_events');
    expect(outbox.rows).toEqual([{ count: 0 }]);
    const jobs = await admin.query<{ kind: string | null }>(
      `select data -> 'payload' ->> 'kind' as kind from pgboss.job where name = $1
       order by kind nulls first`,
      [CLEAN_UP_REMOVED_MEMBER_QUEUE],
    );
    expect(jobs.rows).toEqual([{ kind: null }, { kind: 'owner-handover' }]);
  });
});
