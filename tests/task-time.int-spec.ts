import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  CreateSpaceInternalResponse,
  CreateSubtaskInternalResponse,
  CreateTaskInternalResponse,
  CreateTaskTimeEntryInternalResponse,
  GetTaskStatusDurationsInternalResponse,
  GetTaskTimeEntryInternalResponse,
  GetTaskTimeSummaryInternalResponse,
  ListTaskTimeEntriesInternalResponse,
  TrashTaskInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { createApplication, InternalTokenSigner, loadConfig } from '@cadenway/nest-common';
import type { Ed25519PublicJwk } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import { mirrorCurrentMembership } from './support/current-membership.fixture.js';

const project = `task-time-test-${String(process.pid)}`;
const organizationId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const camille = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e11';
const hugo = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e12';
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

describe('task time with PostgreSQL and NATS', () => {
  let app: NestExpressApplication | undefined;
  let db: pg.Pool | undefined;
  let signer: InternalTokenSigner;
  let listId: string;

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

  async function send(
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    options: { body?: object; headers?: Record<string, string>; actor?: string; org?: string } = {},
  ): Promise<request.Response> {
    if (app === undefined) throw new Error('Application did not start');
    const token = await signer.sign('task-service', {
      actor: { type: 'user', id: options.actor ?? camille },
      organizationId: options.org ?? organizationId,
    });
    let call = request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`);
    for (const [name, value] of Object.entries(options.headers ?? {})) call = call.set(name, value);
    if (options.body !== undefined) call = call.send(options.body);
    return call;
  }

  async function task(name: string, extra: object = {}): Promise<string> {
    const response = await send('post', `/internal/v1/lists/${listId}/tasks`, {
      body: { name, ...extra },
    });
    expect(response.status, response.text).toBe(201);
    return CreateTaskInternalResponse.parse(response.body as unknown).key;
  }

  async function logTime(
    key: string,
    minutes: number,
    options: { actor?: string; headers?: Record<string, string> } = {},
  ): Promise<request.Response> {
    return send('post', `/internal/v1/tasks/${key}/time-entries`, {
      body: { minutes, workDate: '2026-11-07', note: '  Maquette  ' },
      ...options,
    });
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
       values ($1,$2,$3,'owner',1),($1,$4,$5,'member',1)`,
      [organizationId, randomUUID(), camille, randomUUID(), hugo],
    );
    const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
    if (x === undefined || d === undefined) throw new Error('Missing test key material');
    const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'time-test' };
    vi.stubEnv('PORT', '3013');
    vi.stubEnv('LOG_PRETTY', 'false');
    vi.stubEnv('TRASH_WRITES_ENABLED', 'true');
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
    mirrorCurrentMembership(app);
    signer = await InternalTokenSigner.create({
      issuer: 'api-gateway',
      privateJwk: { ...publicJwk, d },
    });
    const space = await send('post', '/internal/v1/spaces', {
      body: { name: 'Atelier Nord', prefix: 'CAD', visibility: 'private' },
    });
    expect(space.status, space.text).toBe(201);
    listId = CreateSpaceInternalResponse.parse(space.body as unknown).firstList.id;
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

  describe('a time entry belongs to its author and is idempotent', () => {
    it('replays the same entry and Location, and refuses a different payload', async () => {
      const key = await task('Refondre l’écran de connexion SSO');
      const headers = { 'Idempotency-Key': 'temps-cad-482' };
      const first = await logTime(key, 150, { headers });
      expect(first.status, first.text).toBe(201);
      const entry = CreateTaskTimeEntryInternalResponse.parse(first.body as unknown);
      expect(entry).toMatchObject({
        taskKey: key,
        authorUserId: camille,
        minutes: 150,
        workDate: '2026-11-07',
        note: 'Maquette',
      });
      expect(first.headers.location).toBe(`/internal/v1/tasks/${key}/time-entries/${entry.id}`);
      const replay = await logTime(key, 150, { headers });
      expect(replay.status, replay.text).toBe(201);
      expect(replay.body).toEqual(first.body);
      expect(replay.headers.location).toBe(first.headers.location);
      expect((await logTime(key, 151, { headers })).status).toBe(422);
      const read = await send('get', `/internal/v1/tasks/${key}/time-entries/${entry.id}`);
      expect(read.status, read.text).toBe(200);
      expect(GetTaskTimeEntryInternalResponse.parse(read.body as unknown)).toEqual(entry);
      const page = await send('get', `/internal/v1/tasks/${key}/time-entries`);
      expect(page.status, page.text).toBe(200);
      expect(ListTaskTimeEntriesInternalResponse.parse(page.body as unknown)).toMatchObject({
        total: 1,
        totalMinutes: 150,
      });
    });

    it('requires the author with edit access to delete and checks access again after revocation', async () => {
      const key = await task('Suivre les accès');
      const grant = `/internal/v1/lists/${listId}/grants/${hugo}`;
      expect((await send('put', grant, { body: { role: 'edit' } })).status).toBe(200);
      const first = await logTime(key, 20);
      expect(first.status, first.text).toBe(201);
      const entry = CreateTaskTimeEntryInternalResponse.parse(first.body as unknown);
      const path = `/internal/v1/tasks/${key}/time-entries/${entry.id}`;
      expect((await send('delete', path, { actor: hugo })).status).toBe(403);
      const headers = { 'Idempotency-Key': 'temps-de-hugo' };
      const own = await logTime(key, 10, { actor: hugo, headers });
      expect(own.status, own.text).toBe(201);
      const ownEntry = CreateTaskTimeEntryInternalResponse.parse(own.body as unknown);
      expect((await send('delete', grant)).status).toBe(204);
      expect((await logTime(key, 10, { actor: hugo, headers })).status).toBe(404);
      expect((await send('put', grant, { body: { role: 'edit' } })).status).toBe(200);
      await query(
        'update organization_members set removed_at = now() where organization_id = $1 and user_id = $2',
        [organizationId, hugo],
      );
      expect((await logTime(key, 10, { actor: hugo, headers })).status).toBe(404);
      const remaining = await send('get', `/internal/v1/tasks/${key}/time-entries`);
      expect(ListTaskTimeEntriesInternalResponse.parse(remaining.body as unknown)).toMatchObject({
        total: 2,
        totalMinutes: 30,
      });
      expect(
        (
          await send('delete', `/internal/v1/tasks/${key}/time-entries/${ownEntry.id}`, {
            actor: hugo,
          })
        ).status,
      ).toBe(404);
      expect((await send('delete', path)).status).toBe(204);
      expect((await send('get', path)).status).toBe(404);
    });
  });

  describe('pagination and totals include only the requested task', () => {
    it('pages in stable order while returning the unpaginated total', async () => {
      const key = await task('Préparer la revue');
      const other = await task('Autre tâche');
      const entries = await Promise.all([logTime(key, 10), logTime(key, 20), logTime(key, 30)]);
      for (const entry of entries) expect(entry.status, entry.text).toBe(201);
      await query(
        `update task_time_entries e set created_at = '2026-11-07T12:00:00.000Z'
         from tasks t where e.organization_id = t.organization_id and e.task_id = t.id
           and t.organization_id = $1 and t.key_prefix = 'CAD' and t.key_number = $2`,
        [organizationId, Number(key.split('-')[1])],
      );
      const subtask = await send('post', `/internal/v1/tasks/${key}/subtasks`, {
        body: { name: 'Maquette' },
      });
      expect(subtask.status, subtask.text).toBe(201);
      const childKey = CreateSubtaskInternalResponse.parse(subtask.body as unknown).key;
      expect((await logTime(childKey, 120)).status).toBe(201);
      const first = await send('get', `/internal/v1/tasks/${key}/time-entries?limit=2`);
      expect(first.status, first.text).toBe(200);
      const page = ListTaskTimeEntriesInternalResponse.parse(first.body as unknown);
      expect(page).toMatchObject({ total: 3, totalMinutes: 60 });
      expect(page.items).toHaveLength(2);
      if (page.nextCursor === null) throw new Error('A second page is expected');
      const next = await send(
        'get',
        `/internal/v1/tasks/${key}/time-entries?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      expect(next.status, next.text).toBe(200);
      const second = ListTaskTimeEntriesInternalResponse.parse(next.body as unknown);
      expect(second).toMatchObject({ total: 3, totalMinutes: 60, nextCursor: null });
      expect(new Set([...page.items, ...second.items].map((entry) => entry.id)).size).toBe(3);
      const ids = [...page.items, ...second.items].map((entry) => entry.id);
      expect(ids).toEqual([...ids].sort().reverse());
      expect(
        (
          await send(
            'get',
            `/internal/v1/tasks/${other}/time-entries?cursor=${encodeURIComponent(page.nextCursor)}`,
          )
        ).status,
      ).toBe(400);
      const summary = await send('get', `/internal/v1/tasks/${key}/time-summary`);
      expect(summary.status, summary.text).toBe(200);
      expect(GetTaskTimeSummaryInternalResponse.parse(summary.body as unknown)).toMatchObject({
        totalMinutes: 60,
      });
      const child = await send('get', `/internal/v1/tasks/${childKey}/time-summary`);
      expect(GetTaskTimeSummaryInternalResponse.parse(child.body as unknown)).toMatchObject({
        totalMinutes: 120,
      });
    });
  });

  describe('an archived task retains readable entries', () => {
    it('refuses entry creation and deletion until restoration', async () => {
      const key = await task('Archiver la maquette');
      const headers = { 'Idempotency-Key': 'temps-avant-archive' };
      const created = await logTime(key, 45, { headers });
      expect(created.status, created.text).toBe(201);
      const entry = CreateTaskTimeEntryInternalResponse.parse(created.body as unknown);
      const path = `/internal/v1/tasks/${key}/time-entries/${entry.id}`;
      expect((await send('post', `/internal/v1/tasks/${key}/archive`, { body: {} })).status).toBe(
        200,
      );
      expect((await send('get', path)).status).toBe(200);
      expect((await logTime(key, 1)).status).toBe(409);
      expect((await logTime(key, 45, { headers })).status).toBe(409);
      const listed = await send('get', `/internal/v1/tasks/${key}/time-entries`);
      expect(ListTaskTimeEntriesInternalResponse.parse(listed.body as unknown)).toMatchObject({
        total: 1,
        totalMinutes: 45,
      });
      expect((await send('delete', path)).status).toBe(409);
      expect((await send('post', `/internal/v1/tasks/${key}/unarchive`, { body: {} })).status).toBe(
        200,
      );
      expect((await send('delete', path)).status).toBe(204);
    });
  });

  describe('time entries follow their task through erasure', () => {
    it('rejects a cross-organization task reference and removes entries when the task is purged', async () => {
      const key = await task('Effacer la maquette');
      const created = await logTime(key, 45);
      expect(created.status, created.text).toBe(201);
      const entry = CreateTaskTimeEntryInternalResponse.parse(created.body as unknown);
      const rows = await query<{ task_id: string }>(
        'select task_id from task_time_entries where organization_id = $1 and id = $2',
        [organizationId, entry.id],
      );
      const taskId = rows[0]?.task_id;
      if (taskId === undefined) throw new Error('Missing time entry');
      await expect(
        query(
          `insert into task_time_entries (organization_id,id,task_id,author_user_id,minutes,work_date)
           values ($1,$2,$3,$4,1,'2026-11-07')`,
          [randomUUID(), randomUUID(), taskId, camille],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      const trashed = await send('post', `/internal/v1/tasks/${key}/trash`, { body: {} });
      expect(trashed.status, trashed.text).toBe(200);
      const trash = TrashTaskInternalResponse.parse(trashed.body as unknown);
      const erased = await send('delete', `/internal/v1/trash/entries/${trash.id}`);
      expect(erased.status, erased.text).toBe(204);
      expect(
        await query('select id from task_time_entries where organization_id = $1 and id = $2', [
          organizationId,
          entry.id,
        ]),
      ).toHaveLength(0);
    });
  });

  describe('status durations describe only known history', () => {
    it('orders status changes by their real serialization after a transaction waits for the task', async () => {
      const key = await task('Ordre des changements');
      if (db === undefined) throw new Error('Database did not start');
      const client = await db.connect();
      let waiting: Promise<request.Response> | undefined;
      try {
        await client.query('begin');
        await client.query("select set_config('app.system_access', 'on', true)");
        const locked = await client.query<{ id: string; list_id: string }>(
          `select id, list_id from tasks where organization_id = $1 and key_prefix = 'CAD'
           and key_number = $2 for no key update`,
          [organizationId, Number(key.split('-')[1])],
        );
        const row = locked.rows[0];
        if (row === undefined) throw new Error('Task was not locked');
        waiting = send('patch', `/internal/v1/tasks/${key}`, { body: { status: 'review' } });
        await expect
          .poll(
            async () => {
              const rows = await query<{ waiting: string }>(
                `select count(*)::text as waiting from pg_locks where not granted`,
              );
              return Number(rows[0]?.waiting ?? 0);
            },
            { timeout: 3_000, interval: 50 },
          )
          .toBeGreaterThan(0);
        await client.query(
          `update tasks set status = 'progress' where organization_id = $1 and id = $2`,
          [organizationId, row.id],
        );
        await client.query(
          `insert into activity_entries (organization_id,task_id,list_id,kind,actor_type,actor_id,occurred_at,status_from,status_to)
           values ($1,$2,$3,'status','user',$4,date_trunc('milliseconds',clock_timestamp()),'todo','progress')`,
          [organizationId, row.id, row.list_id, camille],
        );
        await client.query('commit');
      } finally {
        await client.query('rollback');
        client.release();
      }
      const changed = await waiting;
      expect(changed.status, changed.text).toBe(200);
      const response = await send('get', `/internal/v1/tasks/${key}/status-durations`);
      expect(response.status, response.text).toBe(200);
      const result = GetTaskStatusDurationsInternalResponse.parse(response.body as unknown);
      expect(result.summary?.complete).toBe(true);
      expect(result.summary?.durations.map((item) => item.status)).toEqual([
        'todo',
        'progress',
        'review',
      ]);
      const rows = await query<{ status_to: string; occurred_at: Date }>(
        `select a.status_to, a.occurred_at from activity_entries a join tasks t
         on t.organization_id = a.organization_id and t.id = a.task_id
         where t.organization_id = $1 and t.key_prefix = 'CAD' and t.key_number = $2
           and a.kind = 'status' order by a.occurred_at, a.id`,
        [organizationId, Number(key.split('-')[1])],
      );
      expect(rows.map((row) => row.status_to)).toEqual(['progress', 'review']);
      expect(rows[1]?.occurred_at.getTime()).toBeGreaterThan(rows[0]?.occurred_at.getTime() ?? 0);
    }, 30_000);

    it('reports incomplete coverage for an older task with an unknown initial status', async () => {
      const key = await task('Ancienne tâche');
      await query(
        `update activity_entries a set initial_status = null from tasks t
         where a.organization_id = t.organization_id and a.task_id = t.id
           and t.organization_id = $1 and t.key_prefix = 'CAD' and t.key_number = $2
           and a.kind = 'create'`,
        [organizationId, Number(key.split('-')[1])],
      );
      const response = await send('get', `/internal/v1/tasks/${key}/status-durations`);
      expect(response.status, response.text).toBe(200);
      const result = GetTaskStatusDurationsInternalResponse.parse(response.body as unknown);
      expect(result.summary?.complete).toBe(false);
      expect(result.summary?.coverageStartedAt).toBe(result.summary?.observedAt);
      expect(result.summary?.durations).toMatchObject([
        { status: 'todo', durationMilliseconds: 0, active: true },
      ]);
    });

    it('returns a complete initial span for a new task and no summary for a milestone', async () => {
      const key = await task('Préparer Sprint 14');
      const response = await send('get', `/internal/v1/tasks/${key}/status-durations`);
      expect(response.status, response.text).toBe(200);
      const result = GetTaskStatusDurationsInternalResponse.parse(response.body as unknown);
      expect(result.summary).toMatchObject({
        complete: true,
        durations: [{ status: 'todo', active: true }],
      });
      const milestone = await task('Jalon Sprint 14', { milestone: true });
      const milestoneResponse = await send(
        'get',
        `/internal/v1/tasks/${milestone}/status-durations`,
      );
      expect(milestoneResponse.status, milestoneResponse.text).toBe(200);
      expect(
        GetTaskStatusDurationsInternalResponse.parse(milestoneResponse.body as unknown),
      ).toEqual({ summary: null });
    });

    it('counts repeated visits once per status and marks a terminal status inactive', async () => {
      const key = await task('Finaliser Sprint 14');
      for (const status of ['progress', 'review', 'progress', 'done']) {
        const response = await send('patch', `/internal/v1/tasks/${key}`, { body: { status } });
        expect(response.status, response.text).toBe(200);
      }
      const response = await send('get', `/internal/v1/tasks/${key}/status-durations`);
      expect(response.status, response.text).toBe(200);
      const result = GetTaskStatusDurationsInternalResponse.parse(response.body as unknown);
      expect(result.summary?.complete).toBe(true);
      expect(result.summary?.durations.map((item) => item.status)).toEqual([
        'todo',
        'progress',
        'review',
        'done',
      ]);
      expect(result.summary?.durations.find((item) => item.status === 'done')?.active).toBe(false);
    });
  });
});
