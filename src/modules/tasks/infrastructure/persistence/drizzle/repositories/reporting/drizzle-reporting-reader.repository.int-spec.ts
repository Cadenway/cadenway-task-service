import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TaskFilter } from '../../../../../application/models/query/task-filter.model.js';
import { buildWorkload } from '../../../../../domain/policies/reporting/workload.policy.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { DrizzleReportingReader } from './drizzle-reporting-reader.repository.js';

const org = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const otherOrg = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e20';
const space = '019a7000-0000-7000-8000-000000000001';
const otherSpace = '019a7000-0000-7000-8000-000000000002';
const list = '019a7001-0000-7000-8000-000000000001';
const otherList = '019a7001-0000-7000-8000-000000000002';
const user = '019a7001-0000-7000-8000-000000000003';
const secondUser = '019a7001-0000-7000-8000-000000000004';
const first = '019a7002-0000-7000-8000-000000000001';
const second = '019a7002-0000-7000-8000-000000000002';
const third = '019a7002-0000-7000-8000-000000000003';
const field = '019a7003-0000-7000-8000-000000000001';
const retiredField = '019a7003-0000-7000-8000-000000000002';
const foreignSpaceField = '019a7003-0000-7000-8000-000000000003';
const filter: TaskFilter = {
  statuses: null,
  priorities: null,
  assignees: null,
  labelKeys: null,
  search: null,
  dueFrom: null,
  dueTo: null,
  rootsOnly: false,
};

describe('DrizzleReportingReader', () => {
  let container = '';
  let pool: pg.Pool | null = null;
  let reader: DrizzleReportingReader;

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
    let address = '';
    try {
      const deadline = Date.now() + 15_000;
      while (address === '' && Date.now() < deadline) {
        try {
          address = execFileSync('docker', ['port', container, '5432/tcp'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 2_000,
          }).trim();
        } catch {
          // Docker can return before the published port is visible.
        }
        if (address === '') await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (address === '') throw new Error('The disposable PostgreSQL port was not published.');
    } catch (error) {
      execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
      container = '';
      throw error;
    }
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
      create table tasks (
        organization_id uuid not null, id uuid not null, key_prefix text not null, key_number integer not null,
        space_id uuid not null, list_id uuid not null, parent_id uuid, name text not null, status text not null,
        cancel_reason text, priority text not null, due_date date, start_date date, estimate_minutes integer,
        milestone boolean not null default false, recurrence text not null default 'none', completed_at timestamptz(3),
        created_at timestamptz(3) not null default now(), version integer not null default 1,
        archived_at timestamptz(3), archive_root_id uuid, trash_entry_id uuid,
        primary key (organization_id, id)
      );
      create table task_assignees (organization_id uuid, task_id uuid, user_id uuid, position integer);
      create table task_labels (organization_id uuid, task_id uuid, label_key text, name text, position integer);
      create table checklist_items (organization_id uuid, task_id uuid, done boolean);
      create table task_time_entries (organization_id uuid, id uuid, task_id uuid, author_user_id uuid, minutes integer, work_date date);
      create table activity_entries (organization_id uuid, id uuid, task_id uuid, kind text, status_to text, occurred_at timestamptz);
      create table space_custom_fields (organization_id uuid, id uuid, space_id uuid, name text, type text,
        position integer, sprint_points boolean, version integer, retired_at timestamptz);
      create table task_custom_field_values (organization_id uuid, task_id uuid, field_id uuid, number_value float8, text_value text);
    `);
    await pool.query(
      `
      insert into tasks (organization_id,id,key_prefix,key_number,space_id,list_id,name,status,priority,due_date,estimate_minutes)
      values ($1,$2,'CAD',1,$5,$6,'First','todo','haute','2026-11-25',120),
             ($1,$3,'CAD',2,$5,$6,'Second','progress','basse','2026-11-26',60),
             ($1,$4,'CAD',3,$5,$7,'Hidden','todo','moyenne',null,null),
             ($8,$2,'OTH',1,$5,$6,'Other tenant','todo','moyenne','2026-11-25',30)
    `,
      [org, first, second, third, space, list, otherList, otherOrg],
    );
    await pool.query(
      `insert into task_assignees values
       ($1,$2,$3,0),($1,$4,$3,1),($1,$4,$5,0),($6,$2,$5,0)`,
      [org, first, user, second, secondUser, otherOrg],
    );
    await pool.query(
      `insert into task_labels values
       ($1,$2,'design','Design',1),($1,$2,'review','Review',0),($3,$4,'foreign','Foreign',0)`,
      [org, second, otherOrg, first],
    );
    await pool.query(
      `insert into task_time_entries values
      ($1,'019a7004-0000-7000-8000-000000000001',$2,$4,30,'2026-11-23'),
      ($1,'019a7004-0000-7000-8000-000000000002',$3,$4,45,'2026-11-24'),
      ($5,'019a7004-0000-7000-8000-000000000003',$2,$4,90,'2026-11-23')`,
      [org, first, second, user, otherOrg],
    );
    await pool.query(
      `insert into activity_entries values
      ($1,'019a7005-0000-7000-8000-000000000001',$2,'status','done','2026-11-24T10:00Z'),
      ($1,'019a7005-0000-7000-8000-000000000002',$3,'status','done','2026-11-24T10:00Z'),
      ($1,'019a7005-0000-7000-8000-000000000003',$4,'status','done','2026-11-24T10:00Z')`,
      [org, first, second, third],
    );
    await pool.query(
      `insert into space_custom_fields values
       ($1,$2,$3,'Points','number',0,true,1,null),
       ($1,$4,$3,'Retired','text',1,false,1,now()),
       ($1,$5,$6,'Foreign space','text',0,false,1,null),
       ($7,$2,$3,'Foreign organization','number',0,false,1,null)`,
      [org, field, space, retiredField, foreignSpaceField, otherSpace, otherOrg],
    );
    await pool.query(
      `insert into task_custom_field_values values
       ($1,$2,$3,3,null),($1,$4,$3,1,null),($1,$4,$5,null,'Retired'),
       ($1,$4,$6,null,'Other space'),($7,$2,$3,99,null)`,
      [org, first, field, second, retiredField, foreignSpaceField, otherOrg],
    );
    reader = new DrizzleReportingReader(drizzle(pool));
  });

  afterAll(async () => {
    await pool?.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  it('pages filtered workload and keeps tenant and list scope', async () => {
    const page = await reader.workloadTasks(org, list, filter, '2026-11-23', null, 1);
    expect(page.items.map((task) => task.key.format())).toEqual(['CAD-1']);
    expect(page.next).toBe(first);
    expect(
      (await reader.workloadTasks(org, list, filter, '2026-11-23', page.next, 1)).items.map(
        (task) => task.key.format(),
      ),
    ).toEqual(['CAD-2']);
    expect(
      (await reader.workloadTasks(otherOrg, list, filter, '2026-11-23', null, 10)).items.map(
        (task) => task.key.format(),
      ),
    ).toEqual(['OTH-1']);
  });

  it('preserves workload allocations across pages and date boundaries', async () => {
    if (pool === null) throw new Error('PostgreSQL is unavailable.');
    await pool.query(
      `insert into tasks
       (organization_id,id,key_prefix,key_number,space_id,list_id,name,status,priority,start_date,due_date,estimate_minutes)
       select $1, ('019a7010-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
         'TST', n, $2, $3, 'Workload ' || n,
         case when n % 6 = 5 then 'cancelled' else 'todo' end, 'moyenne',
         case n % 12 when 4 then '2026-11-29'::date when 10 then '2026-12-12'::date
           else null end,
         case n % 6 when 0 then null when 1 then '2026-11-28'::date
           when 2 then '2026-11-20'::date when 3 then '2026-12-08'::date
           when 4 then case when n % 12 = 4 then '2026-11-28'::date else '2026-12-05'::date end
           else '2026-11-26'::date end,
         case when n % 7 = 0 then null else 30 end
       from generate_series(1, 3000) as n`,
      [org, space, otherList],
    );
    try {
      const source = await pool.query<{
        keyNumber: number;
        status: 'todo' | 'cancelled';
        startDate: string | null;
        dueDate: string | null;
        estimateMinutes: number | null;
      }>(
        `select key_number as "keyNumber", status, start_date::text as "startDate",
          due_date::text as "dueDate", estimate_minutes as "estimateMinutes"
         from tasks where organization_id = $1 and list_id = $2 and key_prefix = 'TST' order by id`,
        [org, otherList],
      );
      const original = buildWorkload(
        '2026-11-23',
        source.rows.map((row) => ({
          key: TaskKey.of('TST', row.keyNumber),
          name: `Workload ${String(row.keyNumber)}`,
          status: row.status,
          startDate: row.startDate,
          dueDate: row.dueDate,
          estimateMinutes: row.estimateMinutes,
          assigneeIds: [],
        })),
      );
      const candidates: Parameters<typeof buildWorkload>[1][number][] = [];
      let afterId: string | null = null;
      let pages = 0;
      do {
        const page = await reader.workloadTasks(org, otherList, filter, '2026-11-23', afterId, 500);
        candidates.push(...page.items);
        afterId = page.next;
        pages += 1;
      } while (afterId !== null);
      expect(pages).toBeGreaterThan(1);
      expect(candidates.length).toBeLessThan(source.rows.length);
      expect(candidates.some((task) => task.startDate === '2026-12-12')).toBe(false);
      expect(buildWorkload('2026-11-23', candidates)).toEqual(original);
    } finally {
      await pool.query(`delete from tasks where organization_id = $1 and key_prefix = 'TST'`, [
        org,
      ]);
    }
  });

  it('pages weekly author and task groups, preserves full totals and respects task placement', async () => {
    const page = await reader.timesheetPage(org, list, '2026-11-23', null, 1);
    expect(page.items.map(({ totalMinutes }) => totalMinutes)).toEqual([30]);
    expect(page.items[0]?.minutesByDay).toEqual([30, 0, 0, 0, 0, 0, 0]);
    expect(page.totalMinutes).toBe(75);
    expect(page.days.slice(0, 2)).toEqual([
      { date: '2026-11-23', totalMinutes: 30 },
      { date: '2026-11-24', totalMinutes: 45 },
    ]);

    const next = await reader.timesheetPage(org, list, '2026-11-23', page.next, 1);
    expect(next.items.map(({ totalMinutes }) => totalMinutes)).toEqual([45]);
    expect(next.items[0]?.minutesByDay).toEqual([0, 45, 0, 0, 0, 0, 0]);
    expect(next.totalMinutes).toBe(75);
    expect(next.next).toBeNull();

    const empty = await reader.timesheetPage(org, otherList, '2026-11-23', null, 10);
    expect(empty.items).toEqual([]);
    expect(empty.totalMinutes).toBe(0);
  });

  it('pages dashboard tasks and completion facts over visible lists only', async () => {
    const tasks = await reader.dashboardTasks(org, [list], null, 1);
    expect(tasks.next).toBe(first);
    expect(tasks.items).toMatchObject([{ id: first, assigneeIds: [user], status: 'todo' }]);
    const summaries = await reader.dashboardSummaries(org, [list], [first, second, third]);
    expect(summaries.map(({ id }) => id)).toEqual([first, second]);
    expect(summaries[1]).toMatchObject({
      id: second,
      labels: ['Review', 'Design'],
      assigneeIds: [secondUser, user],
    });
    expect(await reader.dashboardSummaries(org, [otherList], [first, second])).toEqual([]);
    expect(await reader.dashboardSummaries(otherOrg, [list], [first])).toMatchObject([
      { id: first, name: 'Other tenant', assigneeIds: [secondUser] },
    ]);
    await expect(
      reader.dashboardSummaries(
        org,
        [list],
        Array.from({ length: 11 }, () => first),
      ),
    ).rejects.toThrow('limited to ten tasks');
    const page = await reader.dashboardTransitions(
      org,
      [list],
      new Date('2026-11-20T00:00:00Z'),
      new Date('2026-11-25T00:00:00Z'),
      null,
      1,
    );
    expect(page.items.map((entry) => entry.taskId)).toEqual([first]);
    expect(
      (
        await reader.dashboardTransitions(
          org,
          [list],
          new Date('2026-11-20T00:00:00Z'),
          new Date('2026-11-25T00:00:00Z'),
          page.next,
          1,
        )
      ).items.map((entry) => entry.taskId),
    ).toEqual([second]);
    expect(
      (
        await reader.dashboardTransitions(
          org,
          [list],
          new Date('2026-11-25T00:00:00Z'),
          new Date('2026-11-26T00:00:00Z'),
          null,
          10,
        )
      ).items,
    ).toEqual([]);
  });

  it('sorts active field values, rejects unknown fields, and retains headers for an empty list', async () => {
    const order = { key: 'manual', descending: false } as const;
    const result = await reader.prepareExport(
      org,
      list,
      space,
      filter,
      order,
      { column: field, direction: 'asc' },
      10_001,
    );
    if (result.invalidSort) throw new Error('The test field should be available.');
    expect(result.rowCount).toBe(2);
    const firstPage = await result.readPage(0);
    expect(firstPage.map((row) => row.taskKey)).toEqual(['CAD-2', 'CAD-1']);
    expect(firstPage[0]).toEqual({
      taskKey: 'CAD-2',
      name: 'Second',
      status: 'progress',
      priority: 'basse',
      assignees: [secondUser, user],
      dueDate: '2026-11-26',
      labels: ['Review', 'Design'],
      customValues: { [field]: 1 },
    });
    expect(firstPage[1]).toMatchObject({
      assignees: [user],
      labels: [],
      customValues: { [field]: 3 },
    });
    expect(
      (
        await reader.prepareExport(
          org,
          list,
          space,
          filter,
          order,
          { column: third, direction: 'asc' },
          10_001,
        )
      ).invalidSort,
    ).toBe(true);
    expect(
      await reader.prepareExport(
        org,
        otherList,
        space,
        { ...filter, statuses: ['done'] },
        order,
        null,
        10_001,
      ),
    ).toMatchObject({ rowCount: 0, fields: [{ id: field, name: 'Points' }] });
  });

  it('selects at most one row above the limit and hydrates ordered pages in the snapshot', async () => {
    if (pool === null) throw new Error('The test database is not ready.');
    const largeList = '019a7001-0000-7000-8000-000000000005';
    await pool.query(
      `insert into tasks (organization_id,id,key_prefix,key_number,space_id,list_id,name,status,priority)
       select $1,uuidv7(),'CAD',series,$2,$3,lpad(series::text,5,'0'),'todo','haute'
       from generate_series(1,10000) as series`,
      [org, space, largeList],
    );
    const client = await pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const order = { key: 'manual', descending: false } as const;
      const selection = await new DrizzleReportingReader(drizzle(client)).prepareExport(
        org,
        largeList,
        space,
        filter,
        order,
        { column: 'name', direction: 'desc' },
        10_001,
      );
      if (selection.invalidSort) throw new Error('Name should be sortable.');
      expect(selection.rowCount).toBe(10_000);

      await pool.query(
        `insert into tasks (organization_id,id,key_prefix,key_number,space_id,list_id,name,status,priority)
         select $1,uuidv7(),'CAD',series,$2,$3,lpad(series::text,5,'0'),'todo','haute'
         from generate_series(10001,10100) as series`,
        [org, space, largeList],
      );
      const firstPage = await selection.readPage(0);
      const secondPage = await selection.readPage(250);
      expect(firstPage).toHaveLength(250);
      expect(secondPage).toHaveLength(250);
      expect(firstPage[0]?.name).toBe('10000');
      expect(firstPage.at(-1)?.name).toBe('09751');
      expect(secondPage[0]?.name).toBe('09750');
      expect(await selection.readPage(10_000)).toEqual([]);
      expect(
        await reader.prepareExport(org, largeList, space, filter, order, null, 10_001),
      ).toMatchObject({
        rowCount: 10_001,
      });
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
