import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

import { runWithOrganizationContext } from '@cadenway/nest-common';
import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SearchProjectionScope } from '../../../../../application/models/search-projection/search-projection-scope.model.js';
import { DrizzleSearchProjectionReader } from './drizzle-search-projection-reader.repository.js';

const organizationId = '019a7000-0000-7000-8000-000000000001';
const otherOrganizationId = '019a7000-0000-7000-8000-000000000002';
const spaceId = '019a7000-0000-7000-8000-000000000011';
const deletedSpaceId = '019a7000-0000-7000-8000-000000000012';
const foreignSpaceId = '019a7000-0000-7000-8000-000000000013';
const listId = '019a7000-0000-7000-8000-000000000021';
const archivedListId = '019a7000-0000-7000-8000-000000000022';
const listInDeletedSpaceId = '019a7000-0000-7000-8000-000000000023';
const foreignListId = '019a7000-0000-7000-8000-000000000024';
const deletedListId = '019a7000-0000-7000-8000-000000000025';
const taskScope: SearchProjectionScope = { kind: 'task', spaceId, listId };

function taskId(number: number): string {
  return `019a7000-0000-7000-8000-${String(number).padStart(12, '0')}`;
}

function ownSnapshot<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'system', id: 'search-service' }, role: null, scopes: [] },
    work,
  );
}

async function waitForDatabase(pool: Pool): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (cause: unknown) {
      if (attempt === 59) throw cause;
      await setTimeout(500);
    }
  }
}

async function seed(admin: Pool): Promise<void> {
  await admin.query(`
    create role projection_reader login password 'projection_fixture';
    create table spaces (
      organization_id uuid not null, id uuid not null, version integer not null,
      name text not null, deleted_at timestamptz, primary key (organization_id, id)
    );
    create table lists (
      organization_id uuid not null, id uuid not null, version integer not null,
      name text not null, space_id uuid not null, archived_at timestamptz, deleted_at timestamptz,
      primary key (organization_id, id)
    );
    create table tasks (
      organization_id uuid not null, id uuid not null, version integer not null,
      key_prefix text not null, key_number integer not null, name text not null,
      status text not null, list_id uuid not null, space_id uuid not null,
      archived_at timestamptz, trash_entry_id uuid,
      primary key (organization_id, id), unique (organization_id, key_prefix, key_number)
    );
    grant select on spaces, lists, tasks to projection_reader;
  `);
  for (const table of ['spaces', 'lists', 'tasks'] as const) {
    await admin.query(`
      alter table ${table} enable row level security;
      alter table ${table} force row level security;
      create policy tenant_select on ${table} for select
        using (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
    `);
  }
  await admin.query(
    `insert into spaces values ($1,$3,4,'Active space',null), ($1,$4,7,'Deleted space',now()),
      ($2,$5,2,'Other tenant',null)`,
    [organizationId, otherOrganizationId, spaceId, deletedSpaceId, foreignSpaceId],
  );
  await admin.query(
    `insert into lists values ($1,$5,5,'Current list',$3,null,null),
      ($1,$6,8,'Archived list',$3,now(),null), ($1,$7,3,'List in deleted space',$4,null,null),
      ($1,$10,9,'Deleted list',$3,null,now()), ($2,$8,4,'Foreign list',$9,null,null)`,
    [
      organizationId,
      otherOrganizationId,
      spaceId,
      deletedSpaceId,
      listId,
      archivedListId,
      listInDeletedSpaceId,
      foreignListId,
      foreignSpaceId,
      deletedListId,
    ],
  );
  await admin.query(
    `insert into tasks values
      ($1,$9,6,'CAD',1,'Current task','todo',$4,$3,null,null),
      ($1,$10,7,'CAD',2,'Archived task','progress',$4,$3,now(),null),
      ($1,$11,8,'CAD',3,'Trashed task','todo',$4,$3,null,$11),
      ($1,$12,9,'CAD',4,'Second current task','done',$4,$3,null,null),
      ($1,$13,3,'CAD',5,'Task in archived list','todo',$5,$3,null,null),
      ($1,$14,4,'CAD',6,'Task in deleted space','todo',$6,$7,null,null),
      ($1,$15,5,'CAD',7,'Task with foreign placement','todo',$8,$16,null,null),
      ($1,$18,9,'CAD',9,'Task in deleted list','todo',$19,$3,null,null),
      ($2,$17,6,'CAD',8,'Other tenant','todo',$8,$16,null,null)`,
    [
      organizationId,
      otherOrganizationId,
      spaceId,
      listId,
      archivedListId,
      listInDeletedSpaceId,
      deletedSpaceId,
      foreignListId,
      ...[31, 32, 33, 34, 35, 36, 37].map(taskId),
      foreignSpaceId,
      taskId(38),
      taskId(39),
      deletedListId,
    ],
  );
}

describe('DrizzleSearchProjectionReader under PostgreSQL RLS', () => {
  let container = '';
  let admin: Pool | undefined;
  let app: Pool | undefined;
  let reader: DrizzleSearchProjectionReader;

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
    admin = new Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'fixture' });
    await waitForDatabase(admin);
    await seed(admin);
    app = new Pool({
      host: '127.0.0.1',
      port,
      database: 'postgres',
      user: 'projection_reader',
      password: 'projection_fixture',
    });
    reader = new DrizzleSearchProjectionReader(new TenantTransactionRunner(app));
  });

  afterAll(async () => {
    await app?.end();
    await admin?.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  it('pages only active descendants in UUID order with lookahead and a stable upper fence', async () => {
    if (admin === undefined) throw new Error('PostgreSQL fixture is unavailable.');
    const first = await ownSnapshot(() => reader.page(organizationId, taskScope, null, 1));
    expect(first.upperId).toBe(taskId(34));
    expect(first.entries.map(({ rowId, projection }) => [rowId, projection.id])).toEqual([
      [taskId(31), 'CAD-1'],
      [taskId(34), 'CAD-4'],
    ]);
    await admin.query(
      `insert into tasks values ($1,$2,1,'CAD',11,'New after fence','todo',$3,$4,null,null)`,
      [organizationId, taskId(41), listId, spaceId],
    );
    const afterFirst = { afterId: taskId(31), upperId: taskId(34) };
    const second = await ownSnapshot(() => reader.page(organizationId, taskScope, afterFirst, 1));
    expect(second.entries.map(({ projection }) => projection.id)).toEqual(['CAD-4']);

    const conflict = { ...taskScope, spaceId: deletedSpaceId };
    await expect(
      ownSnapshot(() => reader.page(organizationId, conflict, null, 20)),
    ).resolves.toEqual({ upperId: null, entries: [] });
    for (const kind of ['space', 'list'] as const) {
      const page = await ownSnapshot(() =>
        reader.page(organizationId, { kind, spaceId: null, listId: null }, null, 20),
      );
      expect(page.entries.map(({ projection }) => projection.id)).toEqual([
        kind === 'space' ? spaceId : listId,
      ]);
    }
  });

  it('authoritatively resolves current placement, known inactive versions and unknown subjects', async () => {
    if (admin === undefined) throw new Error('PostgreSQL fixture is unavailable.');
    const ids = Array.from({ length: 10 }, (_, i) => `CAD-${String(i + 1)}`);
    const rows = await ownSnapshot(() => reader.resolve(organizationId, 'task', ids));
    const records = Object.fromEntries(
      rows.map(({ id, version, projection }) => [id, [version, projection?.kind ?? null]]),
    );
    expect(records).toEqual({
      'CAD-1': [6, 'task'],
      'CAD-2': [7, null],
      'CAD-3': [8, null],
      'CAD-4': [9, 'task'],
      'CAD-5': [3, null],
      'CAD-6': [4, null],
      'CAD-7': [5, null],
      'CAD-9': [9, null],
    });
    await expect(
      ownSnapshot(() =>
        reader.resolve(organizationId, 'list', [listInDeletedSpaceId, foreignListId]),
      ),
    ).resolves.toEqual([
      { rowId: listInDeletedSpaceId, id: listInDeletedSpaceId, version: 3, projection: null },
    ]);
    await expect(
      ownSnapshot(() => reader.resolve(organizationId, 'space', [deletedSpaceId, foreignSpaceId])),
    ).resolves.toEqual([
      { rowId: deletedSpaceId, id: deletedSpaceId, version: 7, projection: null },
    ]);
    await expect(
      ownSnapshot(() => reader.resolve(otherOrganizationId, 'task', ['CAD-8'])),
    ).rejects.toThrow('tenant context');
    await admin.query(
      'update lists set archived_at = now() where organization_id = $1 and id = $2',
      [organizationId, listId],
    );
    await expect(
      ownSnapshot(() => reader.resolve(organizationId, 'task', ['CAD-1'])),
    ).resolves.toEqual([{ rowId: taskId(31), id: 'CAD-1', version: 6, projection: null }]);
  });
});
