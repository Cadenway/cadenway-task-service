import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleSprintHistoryRepository } from './drizzle-sprint-history.repository.js';

const org = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const otherOrg = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e20';
const task = '019a7002-0000-7000-8000-000000000001';
const otherTask = '019a7002-0000-7000-8000-000000000002';
const sprint = '019a7001-0000-7000-8000-000000000001';
const currentList = '019a7001-0000-7000-8000-000000000002';
const space = '019a7000-0000-7000-8000-000000000001';
const field = '019a7003-0000-7000-8000-000000000001';

describe('DrizzleSprintHistoryRepository', () => {
  let container = '';
  let pool: pg.Pool | undefined;
  let repository: DrizzleSprintHistoryRepository;
  let snapshot = '';
  const until = new Date('2026-11-30T00:00:00Z');

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
      create table tasks (organization_id uuid, id uuid, list_id uuid, trash_entry_id uuid,
        space_id uuid, parent_id uuid, name text, status text, estimate_minutes integer,
        milestone boolean, archived_at timestamptz, key_prefix text, key_number integer,
        created_at timestamptz,
        primary key (organization_id, id));
      create table space_custom_fields (
        organization_id uuid, id uuid, space_id uuid, type text, sprint_points boolean,
        retired_at timestamptz, created_at timestamptz
      );
      create table task_custom_field_values (
        organization_id uuid, task_id uuid, field_id uuid, number_value float8
      );
      create table sprint_task_history (
        organization_id uuid, sequence bigint generated always as identity, task_id uuid,
        list_id uuid, space_id uuid, parent_id uuid, name text, status text,
        estimate_minutes integer, milestone boolean, archived_at timestamptz, trash_entry_id uuid,
        recorded_at timestamptz, transaction_id xid8, baseline boolean,
        foreign key (organization_id, task_id) references tasks on delete cascade
      );
      create table sprint_value_history (
        organization_id uuid, sequence bigint generated always as identity, task_id uuid,
        field_id uuid, number_value float8, recorded_at timestamptz, transaction_id xid8,
        baseline boolean, foreign key (organization_id, task_id) references tasks on delete cascade
      );
      create table sprint_field_history (
        organization_id uuid, sequence bigint generated always as identity, space_id uuid,
        field_id uuid, designated boolean, retired_at timestamptz, recorded_at timestamptz,
        transaction_id xid8, baseline boolean
      );
    `);
    await pool.query(
      `insert into tasks
      (organization_id,id,list_id,space_id,name,status,milestone,key_prefix,key_number,created_at)
      values ($1,$2,$4,$6,'First','todo',false,'CAD',1,'2026-11-01'),
             ($1,$3,$4,$6,'Second','todo',false,'CAD',2,'2026-11-01'),
             ($5,$2,$4,$6,'Other','todo',false,'OTH',1,'2026-11-01')`,
      [org, task, otherTask, currentList, otherOrg, space],
    );
    await pool.query(
      `insert into space_custom_fields values ($1,$2,$3,'number',true,null,'2026-11-01')`,
      [org, field, space],
    );
    await pool.query('insert into task_custom_field_values values ($1,$2,$3,3),($1,$4,$3,7)', [
      org,
      task,
      field,
      otherTask,
    ]);
    await pool.query(
      `
      insert into sprint_task_history
        (organization_id,task_id,list_id,space_id,name,status,milestone,recorded_at,transaction_id,baseline)
      values ($1,$2,$3,$4,'Before','todo',false,'2026-12-10',pg_current_xact_id(),true),
             ($5,$2,$3,$4,'Other tenant','todo',false,'2026-11-10',pg_current_xact_id(),true);
      `,
      [org, task, sprint, space, otherOrg],
    );
    const observation = await pool.query<{ snapshot: string }>(
      'select pg_current_snapshot()::text as snapshot',
    );
    snapshot = observation.rows[0]?.snapshot ?? '';
    await pool.query(
      `
      insert into sprint_task_history
        (organization_id,task_id,list_id,space_id,name,status,milestone,recorded_at,transaction_id,baseline)
      values ($1,$2,$3,$4,'After','done',false,'2026-11-11',pg_current_xact_id(),false)
    `,
      [org, task, sprint, space],
    );
    await pool.query(
      `
      insert into sprint_value_history
        (organization_id,task_id,field_id,number_value,recorded_at,transaction_id,baseline)
      values ($1,$2,$3,3,'2026-12-10',pg_current_xact_id(),true)
    `,
      [org, task, field],
    );
    await pool.query(
      `
      insert into sprint_field_history
        (organization_id,space_id,field_id,designated,recorded_at,transaction_id,baseline)
      values ($1,$2,$3,true,'2026-12-10',pg_current_xact_id(),true)
    `,
      [org, space, field],
    );
    repository = new DrizzleSprintHistoryRepository(drizzle(pool));
  });

  afterAll(async () => {
    await pool?.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  it('finds moved tasks only while their current list is visible', async () => {
    expect(await repository.candidates(org, [sprint], [currentList], null, 20)).toEqual([task]);
    expect(await repository.candidates(org, [sprint], [sprint], null, 20)).toEqual([]);
    expect(await repository.candidates(org, [sprint], [currentList], task, 20)).toEqual([]);
  });

  it('reuses the original MVCC snapshot and retains lazy baselines', async () => {
    const facts = await repository.taskFacts(org, [task], [currentList], until, snapshot, null, 20);
    expect(facts.map((fact) => fact.name)).toEqual(['Before']);
    expect(
      (await repository.valueFacts(org, [task], [currentList], until, snapshot, null, 20))[0]
        ?.numberValue,
    ).toBe(3);
    expect(
      (await repository.fieldFacts(org, space, until, snapshot, null, 20))[0]?.designated,
    ).toBe(true);
    expect(await repository.taskFacts(org, [task], [sprint], until, snapshot, null, 20)).toEqual(
      [],
    );
  });

  it('keeps history tenant scoped and rejects oversized batches', async () => {
    expect(
      (await repository.taskFacts(otherOrg, [task], [currentList], until, snapshot, null, 1)).map(
        (fact) => fact.name,
      ),
    ).toEqual(['Other tenant']);
    await expect(repository.candidates(org, [sprint], [currentList], null, 501)).rejects.toThrow();
  });

  it('proves unchanged fallbacks using all facts in the current database snapshot', async () => {
    expect(await repository.captureObservation()).toMatch(/^\d+:\d+:/);
    const current = await repository.currentTasks(org, [task, otherTask], [currentList]);
    expect(current.map((row) => [row.key.format(), row.unchangedSinceCoverage])).toEqual([
      ['CAD-1', false],
      ['CAD-2', true],
    ]);
    expect(await repository.currentTasks(org, [task], [sprint])).toEqual([]);
    expect((await repository.currentFields(org, space, null, 10))[0]?.unchangedSinceCoverage).toBe(
      false,
    );
    const first = await repository.currentValues(org, [task, otherTask], [currentList], null, 1);
    expect(first.map((value) => [value.taskId, value.unchangedSinceCoverage])).toEqual([
      [task, false],
    ]);
    const next = await repository.currentValues(
      org,
      [task, otherTask],
      [currentList],
      { taskId: task, fieldId: field },
      1,
    );
    expect(next.map((value) => [value.taskId, value.unchangedSinceCoverage])).toEqual([
      [otherTask, true],
    ]);
  });
});
