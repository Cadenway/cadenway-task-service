import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  NOW,
  SPRINT_14,
} from '../src/modules/tasks/domain/tasks.fixture.js';
import { DrizzleActivityRepository } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/activity/drizzle-activity.repository.js';

const otherOrganization = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

describe('activity Git provider persistence', () => {
  let container = '';
  let pool: pg.Pool;
  let closePool: (() => Promise<void>) | undefined;
  let repository: DrizzleActivityRepository;

  beforeAll(async () => {
    container = execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '-e',
        'POSTGRES_PASSWORD=fixture',
        '-p',
        '127.0.0.1::5432',
        'postgres:18.6-alpine@sha256:9ba53c7d41ea093baf5c1ba635ba5434c4f979880527d49bb7d9237d3193085b',
      ],
      { encoding: 'utf8' },
    ).trim();
    const address = execFileSync('docker', ['port', container, '5432/tcp'], {
      encoding: 'utf8',
    }).trim();
    pool = new pg.Pool({
      host: '127.0.0.1',
      port: Number(address.slice(address.lastIndexOf(':') + 1)),
      user: 'postgres',
      password: 'fixture',
    });
    closePool = async () => pool.end();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await pool.query('select 1');
        break;
      } catch (error: unknown) {
        if (attempt === 59) throw error;
        await setTimeout(500);
      }
    }
    const original = readFileSync('migrations/0003_tasks.sql', 'utf8').split(
      '--> statement-breakpoint',
    )[0];
    if (original === undefined) throw new Error('The activity table migration was not found.');
    await pool.query(original);
    await pool.query(`
      alter table activity_entries add column comment_id uuid;
      alter table activity_entries add column comment_excerpt text;
      alter table activity_entries add column initial_status text;
    `);
    await pool.query(
      `insert into activity_entries (organization_id,task_id,list_id,kind,actor_type,actor_id,occurred_at)
       values ($1,$2,$3,'create','git','legacy', $4)`,
      [ATELIER_NORD, CAD_482, SPRINT_14, NOW],
    );
    await pool.query(readFileSync('migrations/0021_git_activity_provider.sql', 'utf8'));
    repository = new DrizzleActivityRepository(drizzle(pool));
  });

  afterAll(async () => {
    await closePool?.();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  it('reads legacy rows and round-trips both providers in their own tenant', async () => {
    for (const [organizationId, provider] of [
      [ATELIER_NORD, 'github'],
      [otherOrganization, 'gitlab'],
    ] as const) {
      await repository.insert([
        {
          organizationId,
          taskId: CAD_482,
          listId: SPRINT_14,
          actor: { type: 'git', id: 'integration', provider },
          occurredAt: NOW,
          change: { kind: 'priority', priority: { from: 'moyenne', to: 'haute' } },
        },
      ]);
    }

    const own = await repository.pageOfTask(ATELIER_NORD, CAD_482, null, null, 10);
    const foreign = await repository.pageOfTask(otherOrganization, CAD_482, null, null, 10);
    expect(own.map((entry) => entry.actor)).toEqual(
      expect.arrayContaining([
        { type: 'git', id: 'legacy' },
        { type: 'git', id: 'integration', provider: 'github' },
      ]),
    );
    expect(foreign.map((entry) => entry.actor)).toEqual([
      { type: 'git', id: 'integration', provider: 'gitlab' },
    ]);
  });

  it('refuses a provider on other actors and unknown providers', async () => {
    for (const [actor, provider] of [
      ['user', 'github'],
      ['git', 'unknown'],
    ]) {
      await expect(
        pool.query(
          `insert into activity_entries (organization_id,task_id,list_id,kind,actor_type,actor_id,actor_provider,occurred_at)
           values ($1,$2,$3,'create',$4,'invalid',$5,$6)`,
          [ATELIER_NORD, CAD_482, SPRINT_14, actor, provider, NOW],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'activity_entries_actor_provider_check',
      });
    }
  });
});
