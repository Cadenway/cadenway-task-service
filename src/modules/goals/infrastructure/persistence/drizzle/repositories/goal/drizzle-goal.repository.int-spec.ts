import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Goal } from '../../../../../domain/aggregates/goal/goal.aggregate.js';
import { DrizzleGoalRepository } from './drizzle-goal.repository.js';

const organizationId = '019a7000-0000-7000-8000-000000000001';
const otherOrganizationId = '019a7000-0000-7000-8000-000000000002';
const ownerUserId = '019a7000-0000-7000-8000-000000000003';
const firstId = '019a7000-0000-7000-8000-000000000010';
const secondId = '019a7000-0000-7000-8000-000000000011';
const otherId = '019a7000-0000-7000-8000-000000000012';

/** Builds a valid goal for a disposable database. */
function goal(id: string, tenant = organizationId): Goal {
  return Goal.create({
    organizationId: tenant,
    id,
    name: 'Sprint 14',
    quarter: '2026-Q4',
    ownerUserId,
    dueDate: '2026-12-31',
    results: [],
  });
}

describe('DrizzleGoalRepository', () => {
  let container = '';
  let pool: pg.Pool | undefined;
  let repository: DrizzleGoalRepository;

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
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
      try {
        await pool.query('select 1');
        ready = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!ready) throw new Error('The disposable PostgreSQL did not start.');
    await pool.query(`
      create table goals (
        organization_id uuid not null, id uuid not null default uuidv7(),
        name text not null, quarter text not null, owner_user_id uuid not null,
        space_id uuid, due_date date not null, version integer not null default 1,
        results jsonb not null default '[]'::jsonb,
        created_at timestamptz(3) not null default now(), updated_at timestamptz(3) not null default now(),
        primary key (organization_id, id),
        check (version > 0),
        check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 20)
      )
    `);
    repository = new DrizzleGoalRepository(drizzle(pool));
    await repository.create(goal(firstId));
    await repository.create(goal(secondId));
    await repository.create(goal(otherId, otherOrganizationId));
    await pool.query('update goals set created_at = $1', ['2026-11-20T10:00:00.123Z']);
  }, 60_000);

  afterAll(async () => {
    if (pool !== undefined) await pool.end();
    if (container !== '') execFileSync('docker', ['stop', container], { encoding: 'utf8' });
  });

  it('paginates equal millisecond timestamps by identifier and excludes other tenants', async () => {
    const firstPage = await repository.listCandidates(organizationId, '2026-Q4', null, 1);
    expect(firstPage.map((entry) => entry.goal.snapshot.id)).toEqual([secondId]);
    const position = firstPage[0]?.position;
    expect(position).toBeDefined();
    if (position === undefined) throw new Error('Expected one candidate.');
    const secondPage = await repository.listCandidates(organizationId, '2026-Q4', position, 1);
    expect(secondPage.map((entry) => entry.goal.snapshot.id)).toEqual([firstId]);
    expect(await repository.find(organizationId, otherId, false)).toBeNull();
  });

  it('rejects an update based on a superseded aggregate version', async () => {
    const original = (await repository.find(organizationId, firstId, false))?.goal;
    expect(original).toBeDefined();
    if (original === undefined) throw new Error('Expected the fixture goal.');
    await repository.save(original.update({ name: 'Atelier Nord' }));
    await expect(repository.save(original.update({ name: 'Sprint suivant' }))).rejects.toThrow(
      'The goal changed before its locked update.',
    );
    expect((await repository.find(organizationId, firstId, false))?.goal.snapshot.name).toBe(
      'Atelier Nord',
    );
  });

  it('allocates a PostgreSQL UUID v7 for a new aggregate', async () => {
    expect(await repository.nextId()).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
  });
});
