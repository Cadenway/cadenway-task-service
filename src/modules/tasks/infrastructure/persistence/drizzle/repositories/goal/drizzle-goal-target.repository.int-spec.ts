import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleGoalTargetRepository } from './drizzle-goal-target.repository.js';

const ORG = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const OTHER = '01938f6e-0000-7000-8000-000000000002';
const LIST = '019a7001-0000-7000-8000-000000000001';
const MOVED = '019a7001-0000-7000-8000-000000000002';
const SPACE = '019a7000-0000-7000-8000-000000000001';
const FIRST = '019a7002-0000-7000-8000-000000000001';
const SECOND = '019a7002-0000-7000-8000-000000000002';

/** Disposable PostgreSQL proves scoping, eligibility and current placement under a task lock. */
describe('DrizzleGoalTargetRepository', () => {
  let container = '';
  let pool: pg.Pool;
  let reader: DrizzleGoalTargetRepository;

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
      create table tasks (
        organization_id uuid not null, id uuid not null, key_prefix text not null,
        key_number integer not null, list_id uuid not null, space_id uuid not null,
        status text not null, milestone boolean not null, parent_id uuid,
        archived_at timestamptz, trash_entry_id uuid,
        primary key (organization_id, id), unique (organization_id, key_prefix, key_number)
      );
      create index tasks_list_created_index on tasks (organization_id, list_id, id);
    `);
    await pool.query(
      `insert into tasks (organization_id,id,key_prefix,key_number,list_id,space_id,status,milestone,parent_id,archived_at,trash_entry_id)
       values
       ($1,$4,'CAD',1,$3,$6,'done',true,null,null,null),
       ($1,$5,'CAD',2,$3,$6,'todo',false,null,null,null),
       ($1,uuidv7(),'CAD',3,$3,$6,'done',false,null,null,null),
       ($1,uuidv7(),'CAD',4,$3,$6,'cancelled',false,null,null,null),
       ($1,uuidv7(),'CAD',5,$3,$6,'done',false,$5,null,null),
       ($1,uuidv7(),'CAD',6,$3,$6,'done',false,null,now(),null),
       ($1,uuidv7(),'CAD',7,$3,$6,'done',false,null,null,uuidv7()),
       ($1,uuidv7(),'CAD',8,$3,$6,'done',true,null,now(),null),
       ($1,uuidv7(),'CAD',9,$3,$6,'done',true,null,null,uuidv7()),
       ($2,uuidv7(),'CAD',10,$3,$6,'done',false,null,null,null),
       ($2,uuidv7(),'CAD',11,$3,$6,'done',true,null,null,null)`,
      [ORG, OTHER, LIST, FIRST, SECOND, SPACE],
    );
    reader = new DrizzleGoalTargetRepository(drizzle(pool));
  });

  afterAll(async () => {
    await pool.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  it('counts only live ordinary root tasks within the requested organization and lists', async () => {
    expect(await reader.listCounts(ORG, [LIST, LIST, MOVED])).toEqual(
      new Map([[LIST, { eligibleTaskCount: 2, doneTaskCount: 1 }]]),
    );
    expect(await reader.listCounts(OTHER, [LIST])).toEqual(
      new Map([[LIST, { eligibleTaskCount: 1, doneTaskCount: 1 }]]),
    );
    expect(await reader.listCounts(ORG, [])).toEqual(new Map());
  });

  it('includes archived milestones and excludes ordinary, trashed and other-tenant tasks', async () => {
    expect(
      await reader.milestones(ORG, ['CAD-1', 'CAD-2', 'CAD-8', 'CAD-9', 'CAD-11', 'bad'], false),
    ).toEqual([
      { key: 'CAD-1', listId: LIST, status: 'done' },
      { key: 'CAD-8', listId: LIST, status: 'done' },
    ]);
  });

  it('waits for a concurrent move and returns the committed placement under its lock', async () => {
    const writer = await pool.connect();
    const transaction = await pool.connect();
    try {
      await writer.query('begin');
      await writer.query('update tasks set list_id = $1 where organization_id = $2 and id = $3', [
        MOVED,
        ORG,
        FIRST,
      ]);
      await transaction.query('begin');
      const locked = new DrizzleGoalTargetRepository(drizzle(transaction));
      const pid = await transaction.query<{ pid: number }>('select pg_backend_pid() as pid');
      const backend = pid.rows[0]?.pid;
      if (backend === undefined) throw new Error('The test transaction has no backend.');
      const pending = locked.milestones(ORG, ['CAD-1'], true);
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt += 1) {
        const state = await pool.query<{ wait_event_type: string | null }>(
          'select wait_event_type from pg_stat_activity where pid = $1',
          [backend],
        );
        waiting = state.rows[0]?.wait_event_type === 'Lock';
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await writer.query('commit');
      expect(await pending).toEqual([{ key: 'CAD-1', listId: MOVED, status: 'done' }]);
      await transaction.query('commit');
    } finally {
      await writer.query('rollback');
      await transaction.query('rollback');
      writer.release();
      transaction.release();
    }
  });
});
