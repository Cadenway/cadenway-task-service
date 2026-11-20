import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  CreateSpaceInternalResponse,
  CreateListInternalResponse,
  CreateTaskInternalResponse,
  DuplicateListInternalResponse,
  DuplicateTaskInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { createApplication, InternalTokenSigner, loadConfig } from '@cadenway/nest-common';
import type { Ed25519PublicJwk } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';

const project = `task-duplication-test-${String(process.pid)}`;
const org = randomUUID();
const actor = randomUUID();
const other = randomUUID();
const observer = randomUUID();
const composeFile = resolve(process.cwd(), 'compose.dev.yaml');

function compose(...args: string[]): string {
  return execFileSync(
    'docker',
    ['compose', '--project-name', project, '--file', composeFile, ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, DEV_POSTGRES_PORT: '0', DEV_NATS_PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

describe('duplication routes with PostgreSQL and NATS', () => {
  let app: NestExpressApplication | undefined;
  let db: pg.Pool | undefined;
  let signer: InternalTokenSigner;
  let spaceId: string;
  let listId: string;
  let sourceKey: string;

  async function query<T extends pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    if (db === undefined) throw new Error('Database did not start');
    const client = await db.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.system_access', 'on', true)");
      const result = await client.query<T>(sql, params);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function post(
    path: string,
    body: object | undefined,
    headers: Record<string, string> = {},
    actorUserId: string = actor,
  ): Promise<request.Response> {
    if (app === undefined) throw new Error('Application did not start');
    const token = await signer.sign('task-service', {
      actor: { type: 'user', id: actorUserId },
      organizationId: org,
    });
    let call = request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);
    for (const [key, value] of Object.entries(headers)) call = call.set(key, value);
    if (body !== undefined) call = call.send(body);
    return call;
  }

  beforeAll(async () => {
    compose(
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '120',
      'postgres',
      'nats',
      'nats-streams',
    );
    const postgresPort = compose('port', 'postgres', '5432').trim().split(':').at(-1);
    const natsPort = compose('port', 'nats', '4222').trim().split(':').at(-1);
    if (postgresPort === undefined || natsPort === undefined)
      throw new Error('Missing Compose port');
    const migrationUrl = `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task`;
    vi.stubEnv('MIGRATION_DATABASE_URL', migrationUrl);
    vi.resetModules();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await import('../src/migrate.js');
    } finally {
      log.mockRestore();
    }
    db = new pg.Pool({ connectionString: migrationUrl });
    await query(
      `insert into organization_members (organization_id,id,user_id,role,version)
       values ($1,$2,$3,'owner',1),($1,$4,$5,'member',1),($1,$6,$7,'member',1)`,
      [org, randomUUID(), actor, randomUUID(), other, randomUUID(), observer],
    );
    const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
    if (x === undefined || d === undefined) throw new Error('Missing test key material');
    const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'duplicate-test' };
    vi.stubEnv('PORT', '3013');
    vi.stubEnv('LOG_PRETTY', 'false');
    vi.stubEnv('DATABASE_URL', `postgres://task_app:task_app@127.0.0.1:${postgresPort}/task`);
    vi.stubEnv('NATS_URL', `nats://127.0.0.1:${natsPort}`);
    vi.stubEnv('NATS_USER', 'task');
    vi.stubEnv('NATS_PASSWORD', 'task');
    vi.stubEnv('INTERNAL_TOKEN_AUDIENCE', 'task-service');
    vi.stubEnv('INTERNAL_TOKEN_TRUSTED_ISSUERS', JSON.stringify({ 'api-gateway': [publicJwk] }));
    const config = loadConfig(appConfigSchema);
    app = await createApplication(AppModule, {
      service: 'task-service',
      config,
      internalToken: {
        verifier: {
          audience: config.INTERNAL_TOKEN_AUDIENCE,
          trustedIssuers: config.INTERNAL_TOKEN_TRUSTED_ISSUERS,
        },
      },
      logDestination: { write: (): void => undefined },
    });
    await app.init();
    signer = await InternalTokenSigner.create({
      issuer: 'api-gateway',
      privateJwk: { ...publicJwk, d },
    });
    const space = await post('/internal/v1/spaces', { name: 'Copy source', prefix: 'CPY' });
    expect(space.status).toBe(201);
    spaceId = CreateSpaceInternalResponse.parse(space.body as unknown).space.id;
    listId = CreateSpaceInternalResponse.parse(space.body as unknown).firstList.id;
    const task = await post(`/internal/v1/lists/${listId}/tasks`, { name: 'Original' });
    expect(task.status).toBe(201);
    sourceKey = CreateTaskInternalResponse.parse(task.body as unknown).key;
  }, 300_000);

  afterAll(async () => {
    try {
      await app?.close();
      await db?.end();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  }, 120_000);

  it('rejects absent and extra request fields for both routes', async () => {
    for (const path of [
      `/internal/v1/tasks/${sourceKey}/duplicate`,
      `/internal/v1/lists/${listId}/duplicate`,
    ]) {
      expect((await post(path, undefined)).status).toBe(400);
      expect((await post(path, { unexpected: true })).status).toBe(400);
    }
  });

  it('duplicates a task once, returning its original Location on idempotent replay and a creation event', async () => {
    const path = `/internal/v1/tasks/${sourceKey}/duplicate`;
    const headers = { 'Idempotency-Key': 'duplicate-task-once' };
    const first = await post(path, {}, headers);
    expect(first.status).toBe(201);
    const copy = DuplicateTaskInternalResponse.parse(first.body);
    expect(copy.key).not.toBe(sourceKey);
    expect(first.headers.location).toBe(`/internal/v1/tasks/${copy.key}`);
    expect(first.headers.etag).toBeDefined();
    const replay = await post(path, {}, headers);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers.location).toBe(first.headers.location);
    expect(replay.headers.etag).toBe(first.headers.etag);
    const emptyReplay = await post(path, undefined, {
      ...headers,
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
    });
    expect(emptyReplay.status).toBe(400);
    const events = await query<{ event_name: string }>(
      `select event_name from outbox_events where payload ->> 'key' = $1`,
      [copy.key],
    );
    expect(events.filter((event) => event.event_name === 'task.created.v1')).toHaveLength(1);
  });

  it('copies an archived list, remaps its task tree, omits direct grants and replays the same Location', async () => {
    const created = await post(`/internal/v1/spaces/${spaceId}/lists`, { name: 'Archived source' });
    expect(created.status).toBe(201);
    const id = CreateListInternalResponse.parse(created.body as unknown).id;
    const parent = await post(`/internal/v1/lists/${id}/tasks`, { name: 'Parent' });
    expect(parent.status).toBe(201);
    expect(
      (
        await post(
          `/internal/v1/tasks/${CreateTaskInternalResponse.parse(parent.body as unknown).key}/subtasks`,
          { name: 'Child' },
        )
      ).status,
    ).toBe(201);
    await query(
      `insert into list_grants (organization_id,list_id,space_id,user_id,role,granted_by_type,granted_by_id) values ($1,$2,$3,$4,'view','user',$5)`,
      [org, id, spaceId, other, actor],
    );
    expect((await post(`/internal/v1/lists/${id}/archive`, {})).status).toBe(200);
    const path = `/internal/v1/lists/${id}/duplicate`;
    const headers = { 'Idempotency-Key': 'duplicate-list-once' };
    const response = await post(path, {}, headers);
    expect(response.status).toBe(201);
    const copy = DuplicateListInternalResponse.parse(response.body);
    expect(copy.taskCount).toBe(2);
    expect(response.headers.location).toBe(`/internal/v1/lists/${copy.list.id}`);
    expect(response.headers.etag).toBeDefined();
    const replay = await post(path, {}, headers);
    expect(replay.body).toEqual(response.body);
    expect(replay.headers.location).toBe(response.headers.location);
    expect(replay.headers.etag).toBe(response.headers.etag);
    const tasks = await query<{ id: string; parent_id: string | null; name: string }>(
      `select id,parent_id,name from tasks where organization_id=$1 and list_id=$2 order by name`,
      [org, copy.list.id],
    );
    const copiedParent = tasks.find((task) => task.name === 'Parent');
    const copiedChild = tasks.find((task) => task.name === 'Child');
    expect(copiedParent).toBeDefined();
    expect(copiedChild?.parent_id).toBe(copiedParent?.id);
    expect(
      await query(`select 1 from list_grants where organization_id=$1 and list_id=$2`, [
        org,
        copy.list.id,
      ]),
    ).toHaveLength(0);
    const events = await query<{ event_name: string }>(
      `select event_name from outbox_events where payload ->> 'listId' = $1 order by event_name`,
      [copy.list.id],
    );
    expect(events.map(({ event_name }) => event_name)).toEqual([
      'list.created.v1',
      'task.created.v1',
      'task.created.v1',
    ]);
  });

  it('retains edit for the initiating source editor without opening a restricted copy to other users', async () => {
    const created = await post(`/internal/v1/spaces/${spaceId}/lists`, {
      name: 'Restricted source',
      organizationAccess: false,
    });
    expect(created.status).toBe(201);
    const id = CreateListInternalResponse.parse(created.body as unknown).id;
    await query(
      `insert into list_grants (organization_id,list_id,space_id,user_id,role,granted_by_type,granted_by_id)
       values ($1,$2,$3,$4,'edit','user',$6),($1,$2,$3,$5,'view','user',$6)`,
      [org, id, spaceId, other, observer, actor],
    );
    const response = await post(`/internal/v1/lists/${id}/duplicate`, {}, {}, other);
    expect(response.status).toBe(201);
    const { list } = DuplicateListInternalResponse.parse(response.body);
    expect(list).toMatchObject({ organizationAccess: false, callerRole: 'edit', version: 2 });
    expect(
      await query(`select user_id, role from list_grants where organization_id=$1 and list_id=$2`, [
        org,
        list.id,
      ]),
    ).toEqual([{ user_id: other, role: 'edit' }]);
    expect(
      await query(
        `select event_name from outbox_events where payload->>'listId' = $1 order by event_name`,
        [list.id],
      ),
    ).toEqual([{ event_name: 'list.access-changed.v1' }, { event_name: 'list.created.v1' }]);
    if (app === undefined) throw new Error('Application did not start');
    const location = String(response.headers.location);
    const editorToken = await signer.sign('task-service', {
      actor: { type: 'user', id: other },
      organizationId: org,
    });
    const observerToken = await signer.sign('task-service', {
      actor: { type: 'user', id: observer },
      organizationId: org,
    });
    const editorRead = await request(app.getHttpServer())
      .get(location)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(editorRead.status).toBe(200);
    const observerRead = await request(app.getHttpServer())
      .get(location)
      .set('Authorization', `Bearer ${observerToken}`);
    expect(observerRead.status).toBe(404);
  });

  it('rolls back the cloned list, tasks, key allocation and earlier facts when a copied fact fails', async () => {
    const created = await post(`/internal/v1/spaces/${spaceId}/lists`, { name: 'Atomic source' });
    expect(created.status).toBe(201);
    const id = CreateListInternalResponse.parse(created.body as unknown).id;
    expect((await post(`/internal/v1/lists/${id}/tasks`, { name: 'First copy' })).status).toBe(201);
    expect(
      (await post(`/internal/v1/lists/${id}/tasks`, { name: 'Reject copied fact' })).status,
    ).toBe(201);

    const stored = () =>
      query(
        `select
          (select count(*)::int from lists where organization_id=$1) as lists,
          (select count(*)::int from tasks where organization_id=$1) as tasks,
          (select last_number from space_prefixes where organization_id=$1 and prefix='CPY') as last_number,
          (select count(*)::int from outbox_events where organization_id=$1) as facts`,
        [org],
      );
    const before = await stored();
    await query(`create function reject_copied_task_fact() returns trigger language plpgsql as $$
      begin
        if new.event_name = 'task.created.v1' and new.payload->>'name' = 'Reject copied fact' then
          raise exception 'test failure from the copied task outbox';
        end if;
        return new;
      end;
    $$`);
    await query(`create trigger reject_copied_task_fact before insert on outbox_events
      for each row execute function reject_copied_task_fact()`);

    try {
      expect((await post(`/internal/v1/lists/${id}/duplicate`, {})).status).toBe(500);
      expect(await stored()).toEqual(before);
    } finally {
      await query('drop trigger reject_copied_task_fact on outbox_events');
      await query('drop function reject_copied_task_fact()');
    }
  });

  it('refuses more than 500 live tasks without creating any list or outbox events', async () => {
    const created = await post(`/internal/v1/spaces/${spaceId}/lists`, { name: 'Over limit' });
    expect(created.status).toBe(201);
    const id = CreateListInternalResponse.parse(created.body as unknown).id;
    await query(
      `insert into tasks (organization_id,key_prefix,key_number,space_id,list_id,name,status,priority,created_by_type,created_by_id) select $1,'CPY',10000+n,$2,$3,'Bulk ' || n,'todo','moyenne','user',$4 from generate_series(1,501) n`,
      [org, spaceId, id, actor],
    );
    const before = await query<{ lists: number; events: number }>(
      `select (select count(*)::int from lists where organization_id=$1) lists, (select count(*)::int from outbox_events) events`,
      [org],
    );
    const result = await post(`/internal/v1/lists/${id}/duplicate`, {});
    expect(result.status).toBe(422);
    expect((result.body as { code: string }).code).toBe('list.duplicate-limit-reached');
    expect(
      await query(
        `select (select count(*)::int from lists where organization_id=$1) lists, (select count(*)::int from outbox_events) events`,
        [org],
      ),
    ).toEqual(before);
  });
});
