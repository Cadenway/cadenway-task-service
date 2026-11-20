import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DependencyCandidatePosition } from '../../../../../application/models/dependency/dependency-candidate-position.model.js';
import { DrizzleTaskCopiesRepository } from '../task/drizzle-task-copies.repository.js';
import { DrizzleTaskDependencyRepository } from './drizzle-task-dependency.repository.js';

const ORG = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const OTHER_ORG = '01938f6e-0000-7000-8000-000000000002';
const LIST = '019a7001-0000-7000-8000-000000000001';
const OTHER_LIST = '019a7001-0000-7000-8000-000000000002';
const SPACE = '019a7000-0000-7000-8000-000000000001';
const A = '019a7002-0000-7000-8000-000000000001';
const B = '019a7002-0000-7000-8000-000000000002';
const C = '019a7002-0000-7000-8000-000000000003';
const D = '019a7002-0000-7000-8000-000000000004';
const E = '019a7002-0000-7000-8000-000000000005';
const F = '019a7002-0000-7000-8000-000000000006';

/** Disposable PostgreSQL for SQL behavior independent of the pending numbered migration. */
describe('DrizzleTaskDependencyRepository', () => {
  let container = '';
  let pool: pg.Pool;
  let repository: DrizzleTaskDependencyRepository;

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
        key_number integer not null, space_id uuid not null, list_id uuid not null,
        parent_id uuid, name text not null, description text, description_mentions jsonb,
        status text not null,
        cancel_reason text, cancel_note text, priority text not null, due_date date,
        start_date date, estimate_minutes integer, completed_at timestamptz(3),
        created_at timestamptz(3) not null default now(), created_by_type text not null,
        created_by_id text not null, updated_at timestamptz not null default now(),
        version integer not null default 1, milestone boolean not null default false,
        recurrence text not null default 'none', monthly_anchor_day integer, next_occurrence_key text,
        archived_at timestamptz(3), archived_by_type text,
        archived_by_id text, archive_root_id uuid, archive_root boolean not null default false,
        trash_entry_id uuid, primary key (organization_id, id)
      );
      create table task_dependencies (
        organization_id uuid not null, id uuid not null default uuidv7(),
        blocker_task_id uuid not null, blocked_task_id uuid not null,
        created_at timestamptz(3) not null default now(), primary key (organization_id, id),
        unique (organization_id, blocker_task_id, blocked_task_id),
        foreign key (organization_id, blocker_task_id) references tasks on delete cascade,
        foreign key (organization_id, blocked_task_id) references tasks on delete cascade
      );
      create table task_assignees (organization_id uuid, task_id uuid, user_id uuid, position integer);
      create table task_labels (organization_id uuid, task_id uuid, label_key text, name text, position integer);
      create table checklist_items (
        organization_id uuid, id uuid default uuidv7(), task_id uuid, text text,
        done boolean, position integer, created_at timestamptz default now()
      );
    `);
    for (const [index, id, list] of [
      [1, A, LIST],
      [2, B, LIST],
      [3, C, OTHER_LIST],
      [4, D, OTHER_LIST],
    ] as const) {
      await pool.query(
        `insert into tasks (organization_id,id,key_prefix,key_number,space_id,list_id,name,status,priority,created_by_type,created_by_id)
         values ($1,$2,'CAD',$3,$4,$5,$6,'todo','moyenne','user','fixture')`,
        [ORG, id, index, SPACE, list, `Task ${String(index)}`],
      );
    }
    repository = new DrizzleTaskDependencyRepository(drizzle(pool));
  });

  afterAll(async () => {
    await pool.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  beforeEach(async () => {
    await pool.query('delete from task_dependencies');
    await pool.query('delete from task_assignees');
    await pool.query('delete from task_labels');
    await pool.query('delete from checklist_items');
    await pool.query('delete from tasks where id = any($1::uuid[])', [[E, F]]);
    await pool.query('update tasks set archived_at = null');
  });

  it('checks retained transitive edges and pages only the visible live counterparts', async () => {
    const first = await repository.insert(ORG, A, B);
    await repository.insert(ORG, B, C);
    expect(await repository.inspect(ORG, C, A)).toMatchObject({ cycle: true, duplicate: false });
    expect(await repository.inspect(ORG, A, B)).toMatchObject({ duplicate: true });
    expect(await repository.inspect(OTHER_ORG, C, A)).toMatchObject({
      cycle: false,
      duplicate: false,
    });
    expect((await repository.page(ORG, B, [LIST], null, 10)).items.map((edge) => edge.id)).toEqual([
      first.id,
    ]);
    expect(await repository.get(ORG, B, first.id, [LIST])).toMatchObject({
      blocker: { key: 'CAD-1' },
      blocked: { key: 'CAD-2' },
    });
    await pool.query(
      'update tasks set archived_at = now() where organization_id = $1 and id = $2',
      [ORG, A],
    );
    expect((await repository.page(ORG, B, [LIST, OTHER_LIST], null, 10)).items).toHaveLength(1);
    expect(await repository.inspect(ORG, C, A)).toMatchObject({ cycle: true });
  });

  it('filters duplicate edges, retained cycles and invisible lists before paging candidates', async () => {
    await repository.insert(ORG, A, B);
    await repository.insert(ORG, B, C);
    const page = await repository.candidates({
      organizationId: ORG,
      anchorId: B,
      anchorListId: LIST,
      editableListIds: [LIST, OTHER_LIST],
      direction: 'blocks',
      search: 'Task',
      after: null,
      limit: 1,
    });
    expect(page.items.map((task) => task.key)).toEqual(['CAD-4']);
    expect(page.total).toBe(1);
    expect(page.next).toBeNull();
    const reverse = await repository.candidates({
      organizationId: ORG,
      anchorId: B,
      anchorListId: LIST,
      editableListIds: [LIST, OTHER_LIST],
      direction: 'blocked-by',
      search: null,
      after: null,
      limit: 1,
    });
    expect(reverse.items.map((task) => task.key)).toEqual(['CAD-4']);
    expect(reverse.total).toBe(1);
  });

  it('walks equal candidate names by stable key and keeps same-list rows first', async () => {
    await pool.query(
      `insert into tasks (organization_id,id,key_prefix,key_number,space_id,list_id,name,status,priority,created_by_type,created_by_id)
       values ($1,$2,'CAD',5,$3,$4,'Task 2','todo','moyenne','user','fixture'),
              ($1,$5,'CAD',6,$3,$6,'A other list','todo','moyenne','user','fixture')`,
      [ORG, E, SPACE, LIST, F, OTHER_LIST],
    );
    const query = {
      organizationId: ORG,
      anchorId: A,
      anchorListId: LIST,
      editableListIds: [LIST, OTHER_LIST],
      direction: 'blocks' as const,
      search: null,
      limit: 1,
    };
    const keys: string[] = [];
    let after: DependencyCandidatePosition | null = null;
    do {
      const page = await repository.candidates({ ...query, after });
      expect(page.total).toBe(5);
      keys.push(...page.items.map((task) => task.key));
      after = page.next;
    } while (after !== null);
    expect(keys).toEqual(['CAD-2', 'CAD-5', 'CAD-6', 'CAD-3', 'CAD-4']);
  });

  it('holds the graph lock until commit without blocking a different organization', async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('begin');
      await second.query('begin');
      await new DrizzleTaskDependencyRepository(drizzle(first)).lockGraph(ORG);
      const key = `task-dependencies:${ORG}`;
      const otherKey = `task-dependencies:${OTHER_ORG}`;
      const held = await second.query<{ acquired: boolean }>(
        'select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as acquired',
        [key],
      );
      const separate = await second.query<{ acquired: boolean }>(
        'select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as acquired',
        [otherKey],
      );
      expect(held.rows[0]?.acquired).toBe(false);
      expect(separate.rows[0]?.acquired).toBe(true);
      await first.query('commit');
      const released = await second.query<{ acquired: boolean }>(
        'select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as acquired',
        [key],
      );
      expect(released.rows[0]?.acquired).toBe(true);
    } finally {
      await first.query('rollback');
      await second.query('rollback');
      first.release();
      second.release();
    }
  });

  it('copies a single-snapshot source checklist with fresh ids and its original version', async () => {
    await pool.query(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       values ($1, $2, '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30', 0)`,
      [ORG, A],
    );
    await pool.query(
      `insert into task_labels (organization_id, task_id, label_key, name, position)
       values ($1, $2, 'front', 'Front', 0)`,
      [ORG, A],
    );
    await pool.query(
      `insert into checklist_items (organization_id, task_id, text, done, position)
       values ($1, $2, 'First', true, 0), ($1, $2, 'Second', false, 2)`,
      [ORG, A],
    );
    const copies = new DrizzleTaskCopiesRepository(drizzle(pool));
    const limited = await copies.listSources(ORG, LIST, 1);
    expect(limited).toHaveLength(1);
    const source = limited[0];
    if (source === undefined) throw new Error('The source task was not read.');
    expect(source.snapshot).toMatchObject({
      id: A,
      assigneeIds: ['019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30'],
      labels: ['Front'],
      checklist: [
        { text: 'First', done: true, position: 0 },
        { text: 'Second', done: false, position: 2 },
      ],
    });
    const targets = await copies.listSources(ORG, OTHER_LIST, 2);
    const target = targets.find((candidate) => candidate.snapshot.id === D);
    if (target === undefined) throw new Error('The target task was not read.');
    const copied = await copies.insertChecklist(target, source.snapshot.checklist);
    expect(copied.snapshot.version).toBe(target.snapshot.version);
    expect(copied.snapshot.checklist).toMatchObject([
      { text: 'First', done: true, position: 0 },
      { text: 'Second', done: false, position: 2 },
    ]);
    expect(copied.snapshot.checklist.map((item) => item.id)).not.toEqual(
      source.snapshot.checklist.map((item) => item.id),
    );
    await pool.query(
      'update tasks set archived_at = now() where organization_id = $1 and id = $2',
      [ORG, A],
    );
    expect((await copies.listSources(ORG, LIST, 2)).map((item) => item.snapshot.id)).toEqual([B]);
    expect(await copies.listSources(OTHER_ORG, LIST, 2)).toEqual([]);
  });

  it('reads a bounded source list by creation instant and id', async () => {
    await pool.query(
      `update tasks set created_at = case id
        when $2::uuid then '2026-11-02T12:00:00Z'::timestamptz
        else '2026-11-01T12:00:00Z'::timestamptz end
       where organization_id = $1 and id = any($3::uuid[])`,
      [ORG, A, [A, B]],
    );
    const copies = new DrizzleTaskCopiesRepository(drizzle(pool));
    expect((await copies.listSources(ORG, LIST, 1)).map((task) => task.snapshot.id)).toEqual([B]);
    expect((await copies.listSources(ORG, LIST, 2)).map((task) => task.snapshot.id)).toEqual([
      B,
      A,
    ]);
  });

  it('bulk copies more than one checklist batch in task order with fresh identities', async () => {
    await pool.query(
      `insert into tasks (organization_id,id,key_prefix,key_number,space_id,list_id,name,status,priority,created_by_type,created_by_id)
       select $1, md5(('bulk-copy-' || n)::text)::uuid, 'BULK', n, $2, $3,
         'Copy ' || n, 'todo', 'moyenne', 'user', 'fixture'
       from generate_series(1, 11) n`,
      [ORG, SPACE, OTHER_LIST],
    );
    let inserts = 0;
    const copies = new DrizzleTaskCopiesRepository(
      drizzle(pool, {
        logger: {
          logQuery(query: string): void {
            if (query.startsWith('insert into "checklist_items"')) inserts += 1;
          },
        },
      }),
    );
    const targets = (await copies.listSources(ORG, OTHER_LIST, 20)).filter((task) =>
      task.snapshot.name.startsWith('Copy '),
    );
    const sources = targets.map(() =>
      Array.from({ length: 100 }, (_, position) => ({
        id: A,
        text: `Item ${String(position)}`,
        done: position % 2 === 0,
        position,
      })),
    );
    expect(targets).toHaveLength(11);
    await expect(copies.insertChecklists(targets, [])).rejects.toThrow();
    const copied = await copies.insertChecklists(targets, sources);
    expect(inserts).toBe(2);
    expect(copied.map((task) => task.snapshot.id)).toEqual(targets.map((task) => task.snapshot.id));
    expect(copied.every((task) => task.snapshot.version === 1)).toBe(true);
    const allItems = copied.flatMap((task) => task.snapshot.checklist);
    expect(allItems).toHaveLength(1100);
    expect(new Set(allItems.map((item) => item.id)).size).toBe(1100);
    expect(allItems.every((item) => item.id !== A)).toBe(true);
    expect(
      copied[0]?.snapshot.checklist.map(({ text, done, position }) => ({ text, done, position })),
    ).toEqual(sources[0]?.map(({ text, done, position }) => ({ text, done, position })));
    expect(
      copied[10]?.snapshot.checklist.map(({ text, done, position }) => ({ text, done, position })),
    ).toEqual(sources[10]?.map(({ text, done, position }) => ({ text, done, position })));
  });
});
