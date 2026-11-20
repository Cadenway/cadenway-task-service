import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleSprintListHistoryRepository } from './drizzle-sprint-list-history.repository.js';

const org = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const otherOrg = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e20';
const space = '019a7000-0000-7000-8000-000000000001';
const user = '019a7004-0000-7000-8000-000000000001';
const viewer = { userId: user, role: 'guest' as const };
const list = (suffix: number): string =>
  `019a7001-0000-7000-8000-${String(suffix).padStart(12, '0')}`;

describe('DrizzleSprintListHistoryRepository', () => {
  let container = '';
  let pool: pg.Pool | undefined;
  let repository: DrizzleSprintListHistoryRepository;
  let snapshot = '';

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
      create table spaces (
        organization_id uuid, id uuid, owner_user_id uuid, visibility text,
        awaiting_owner boolean, deleted_at timestamptz, primary key (organization_id,id)
      );
      create table lists (
        organization_id uuid, id uuid, space_id uuid, name text,
        sprint_start_date date, sprint_end_date date, organization_access boolean,
        archived_at timestamptz, deleted_at timestamptz, created_at timestamptz,
        primary key (organization_id,id)
      );
      create table space_grants (organization_id uuid, space_id uuid, user_id uuid, role text);
      create table list_grants (organization_id uuid, list_id uuid, user_id uuid, role text);
      create table sprint_list_history (
        organization_id uuid, sequence bigint generated always as identity, list_id uuid,
        space_id uuid, sprint_start_date date, sprint_end_date date, deleted_at timestamptz,
        recorded_at timestamptz, transaction_id xid8, baseline boolean,
        foreign key (organization_id,list_id) references lists on delete cascade
      );
    `);
    await pool.query(
      `insert into spaces values ($1,$2,$3,'private',false,null),($4,$2,$3,'private',false,null)`,
      [org, space, user, otherOrg],
    );
    for (let index = 1; index <= 7; index += 1) {
      await pool.query(
        `insert into lists values
          ($1,$2,$3,$4,'2026-10-01',$5,false,$6,null,'2026-01-01')`,
        [
          org,
          list(index),
          space,
          `Sprint ${String(index)}`,
          `2026-10-${String(index).padStart(2, '0')}`,
          index === 5 ? new Date('2026-11-01') : null,
        ],
      );
      if (index <= 5) {
        await pool.query("insert into list_grants values ($1,$2,$3,'view')", [
          org,
          list(index),
          user,
        ]);
      }
    }
    await pool.query(
      `insert into lists values
      ($1,$2,$3,'Other','2026-10-01','2026-10-31',false,null,null,'2026-01-01')`,
      [otherOrg, list(8), space],
    );
    await pool.query(
      `insert into sprint_list_history
        (organization_id,list_id,space_id,sprint_start_date,sprint_end_date,recorded_at,transaction_id,baseline)
       values ($1,$2,$3,'2026-10-01','2026-10-05','2026-12-01',pg_current_xact_id(),true)`,
      [org, list(5), space],
    );
    const observation = await pool.query<{ snapshot: string }>(
      'select pg_current_snapshot()::text as snapshot',
    );
    snapshot = observation.rows[0]?.snapshot ?? '';
    await pool.query(
      `insert into sprint_list_history
        (organization_id,list_id,space_id,sprint_start_date,sprint_end_date,recorded_at,transaction_id,baseline)
       values ($1,$2,$3,'2026-10-01','2026-10-06','2026-11-01',pg_current_xact_id(),false)`,
      [org, list(5), space],
    );
    repository = new DrizzleSprintListHistoryRepository(drizzle(pool));
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (container !== '') execFileSync('docker', ['stop', container], { stdio: 'ignore' });
  }, 60_000);

  it('filters guest visibility before the four-row limit and keeps archived sprints', async () => {
    const rows = await repository.listVisibleCompleted(
      org,
      space,
      viewer,
      '2026-11-01',
      '2026-10-31',
    );
    expect(rows.map((row) => row.listId)).toEqual([list(5), list(4), list(3), list(2)]);
    expect(
      await repository.listVisibleCompleted(otherOrg, space, viewer, '2026-11-01', '2026-10-31'),
    ).toEqual([]);
  });

  it('keeps late baselines, excludes later transactions, and rechecks current visibility', async () => {
    const rows = await repository.listFacts(
      org,
      viewer,
      [list(5), list(6)],
      new Date('2026-11-30'),
      snapshot,
      null,
      10,
    );
    expect(rows.map((row) => [row.listId, row.baseline])).toEqual([[list(5), true]]);
    const current = await repository.currentLists(org, viewer, [list(5), list(6)]);
    expect(current.map((row) => [row.listId, row.unchangedSinceCoverage])).toEqual([
      [list(5), false],
    ]);
  });
});
