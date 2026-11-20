import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { DrizzleTaskReader } from './drizzle-task-reader.repository.js';
import { DrizzleTaskRepository } from './drizzle-task.repository.js';

const ORG = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const OTHER_ORG = '01938f6e-0000-7000-8000-000000000002';
const SPACE = '019a7000-0000-7000-8000-000000000001';
const LIST = '019a7001-0000-7000-8000-000000000001';
const ACTIVE = '019a7002-0000-7000-8000-000000000001';
const ARCHIVED = '019a7002-0000-7000-8000-000000000002';
const TRASHED = '019a7002-0000-7000-8000-000000000003';

describe('task location persistence', () => {
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
      create table tasks (
        organization_id uuid not null, id uuid not null, key_prefix text not null,
        key_number integer not null, name text not null, status text not null,
        list_id uuid not null, space_id uuid not null, archived_at timestamptz,
        trash_entry_id uuid, primary key (organization_id, id)
      )
    `);
    await pool.query(
      `insert into tasks (organization_id,id,key_prefix,key_number,name,status,list_id,space_id,archived_at,trash_entry_id)
       values ($1,$2,'CAD',1,'Active','todo',$5,$6,null,null),
              ($1,$3,'CAD',2,'Archived','todo',$5,$6,now(),null),
              ($1,$4,'CAD',3,'Trashed','todo',$5,$6,null,$4)`,
      [ORG, ACTIVE, ARCHIVED, TRASHED, LIST, SPACE],
    );
  });

  afterAll(async () => {
    await pool.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  it('reads archive state within the tenant and excludes trashed tasks', async () => {
    const db = drizzle(pool);
    const reader = new DrizzleTaskReader(db);
    const locked = new DrizzleTaskRepository(db);

    expect(await reader.attachmentLocationByKey(ORG, TaskKey.parse('CAD-1'))).toMatchObject({
      id: ACTIVE,
      archived: false,
    });
    expect(await reader.attachmentLocationByKey(ORG, TaskKey.parse('CAD-2'))).toMatchObject({
      id: ARCHIVED,
      archived: true,
    });
    expect(await reader.locationsByIds(ORG, [ACTIVE, ARCHIVED, TRASHED])).toHaveLength(2);
    expect(await reader.locationByKey(ORG, TaskKey.parse('CAD-2'))).not.toHaveProperty('archived');
    expect(await locked.shareLocationUnlessLocked(ORG, TaskKey.parse('CAD-2'))).not.toHaveProperty(
      'archived',
    );
    expect(await reader.attachmentLocationByKey(ORG, TaskKey.parse('CAD-3'))).toBeNull();
    expect(await locked.shareLocationUnlessLocked(ORG, TaskKey.parse('CAD-3'))).toBeNull();
    expect(await reader.attachmentLocationByKey(OTHER_ORG, TaskKey.parse('CAD-2'))).toBeNull();
    expect(await reader.locationsByIds(OTHER_ORG, [ACTIVE, ARCHIVED])).toEqual([]);
    expect(await locked.shareLocationUnlessLocked(OTHER_ORG, TaskKey.parse('CAD-2'))).toBeNull();
  });
});
