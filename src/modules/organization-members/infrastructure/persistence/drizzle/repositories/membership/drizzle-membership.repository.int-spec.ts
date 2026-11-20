import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleMembershipRepository } from './drizzle-membership.repository.js';

const ORG = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const OTHER = '01938f6e-0000-7000-8000-000000000002';
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

/** Database-level coverage of bounded membership selection and row locks. */
describe('DrizzleMembershipRepository.listActiveByUsers', () => {
  let container = '';
  let pool: pg.Pool;

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
    const port = Number(address.slice(address.lastIndexOf(':') + 1));
    pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'fixture' });
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
      create table organization_members (
        organization_id uuid not null, id uuid not null, user_id uuid not null,
        role text not null, version bigint not null, removed_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        primary key (organization_id, id)
      );
      create index organization_members_organization_user_index on organization_members (organization_id, user_id);
    `);
  });

  afterAll(async () => {
    await pool.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  beforeEach(async () => {
    await pool.query('delete from organization_members');
  });

  it('selects the newest ten active memberships per user in stable lock order', async () => {
    await pool.query(
      `insert into organization_members (organization_id,id,user_id,role,version,created_at)
       select $1,md5(('member-' || n)::text)::uuid,$2,
              case when n = 2 then 'guest' else 'member' end,
              1, to_timestamp(n)
       from generate_series(1, 11) as n`,
      [ORG, CAMILLE],
    );
    await pool.query(
      `insert into organization_members (organization_id,id,user_id,role,version,removed_at)
       values ($1,uuidv7(),$2,'admin',1,null), ($1,uuidv7(),$3,'guest',1,now()),
              ($4,uuidv7(),$2,'owner',1,null)`,
      [ORG, HUGO, CAMILLE, OTHER],
    );
    const repository = new DrizzleMembershipRepository(drizzle(pool));
    const members = await repository.listActiveByUsers(ORG, [HUGO, CAMILLE, HUGO], false);
    expect(members).toHaveLength(11);
    expect(members.map((member) => member.snapshot.userId)).toEqual([
      ...Array<string>(10).fill(CAMILLE),
      HUGO,
    ]);
    expect(members.filter((member) => member.snapshot.role === 'guest')).toHaveLength(1);
    const single = await repository.listActiveByUser(ORG, CAMILLE, false);
    expect(members.slice(0, 10).map((member) => member.snapshot.id)).toEqual(
      single.map((member) => member.snapshot.id),
    );
    expect(await repository.listActiveByUsers(OTHER, [CAMILLE], false)).toEqual([]);
  });

  it('holds the returned rows against a concurrent update until the transaction ends', async () => {
    const row = await pool.query<{ id: string }>(
      `insert into organization_members (organization_id,id,user_id,role,version)
       values ($1,uuidv7(),$2,'member',1) returning id`,
      [ORG, CAMILLE],
    );
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('begin');
      await second.query('begin');
      const repository = new DrizzleMembershipRepository(drizzle(first));
      expect(await repository.listActiveByUsers(ORG, [CAMILLE], true)).toHaveLength(1);
      await expect(
        second.query(
          'select id from organization_members where organization_id = $1 and id = $2 for update nowait',
          [ORG, row.rows[0]?.id],
        ),
      ).rejects.toMatchObject({ code: '55P03' });
      await first.query('commit');
    } finally {
      await first.query('rollback');
      await second.query('rollback');
      first.release();
      second.release();
    }
  });

  it('handles a full forest of ten thousand distinct assignees', async () => {
    const inserted = await pool.query<{ user_id: string }>(
      `insert into organization_members (organization_id,id,user_id,role,version)
       select $1, uuidv7(), md5(('account-' || n)::text)::uuid, 'member', 1
       from generate_series(1, 10000) as n returning user_id`,
      [ORG],
    );
    const repository = new DrizzleMembershipRepository(drizzle(pool));
    const ids = inserted.rows.map((row) => row.user_id);
    const members = await repository.listActiveByUsers(ORG, ids, false);
    expect(members).toHaveLength(10_000);
    expect(new Set(members.map((member) => member.snapshot.userId)).size).toBe(10_000);
  });
});
