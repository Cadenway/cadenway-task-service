import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  CreateSpaceInternalResponse,
  CreateTaskInternalResponse,
  CreateGoalInternalResponse,
  ListGoalsInternalResponse,
  GetGoalInternalResponse,
  UpdateGoalInternalResponse,
  CreateGoalResultInternalResponse,
  GetGoalResultInternalResponse,
  UpdateGoalResultInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { createApplication, InternalTokenSigner, loadConfig } from '@cadenway/nest-common';
import type { Ed25519PublicJwk } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import { ReadCurrentMembership } from '../src/modules/organization-members/public/membership/read-current-membership.js';
import { mirrorCurrentMembership } from './support/current-membership.fixture.js';

const project = `task-goals-test-${String(process.pid)}`;
const organizationId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const camille = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e11';
const hugo = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e12';
const nadia = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e13';
const today = '2026-11-20';
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

describe('goal routes with PostgreSQL and NATS', () => {
  let app: NestExpressApplication | undefined;
  let db: pg.Pool | undefined;
  let signer: InternalTokenSigner;

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
       values ($1,$2,$3,'owner',1),($1,$4,$5,'member',1),($1,$6,$7,'guest',1)`,
      [organizationId, randomUUID(), camille, randomUUID(), hugo, randomUUID(), nadia],
    );
    const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
    if (x === undefined || d === undefined) throw new Error('Missing test key material');
    const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'goals-test' };
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
      body: { name: 'Atelier Nord', prefix: 'CAD', visibility: 'organization' },
    });
    expect(space.status, space.text).toBe(201);
    CreateSpaceInternalResponse.parse(space.body as unknown);
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

  const basicGoal = {
    name: 'Lancer le SSO pour les entreprises',
    ownerUserId: camille,
    dueDate: '2026-12-31',
    quarter: '2026-Q4',
    results: [{ kind: 'checkbox', label: 'Documentation SSO publiée', checked: true }],
  };

  async function createGoal(body: object = basicGoal): Promise<request.Response> {
    const created = await send('post', `/internal/v1/goals?today=${today}`, { body });
    expect(created.status, created.text).toBe(201);
    CreateGoalInternalResponse.parse(created.body as unknown);
    return created;
  }

  describe('goals and results use one aggregate version', () => {
    it('creates, lists, reads, updates and deletes a goal and its result', async () => {
      const created = await createGoal();
      const goal = CreateGoalInternalResponse.parse(created.body as unknown);
      expect(created.headers.location).toBe(`/v1/goals/${goal.id}?today=${today}`);
      expect(created.headers.etag).toBe(`"${String(goal.version)}"`);
      expect(goal).toMatchObject({ progressPercent: 100, health: 'achieved' });

      const listed = await send('get', `/internal/v1/goals?quarter=2026-Q4&today=${today}`);
      expect(listed.status, listed.text).toBe(200);
      expect(
        ListGoalsInternalResponse.parse(listed.body as unknown).items.map((item) => item.id),
      ).toContain(goal.id);
      const read = await send('get', `/internal/v1/goals/${goal.id}?today=${today}`);
      expect(read.status, read.text).toBe(200);
      expect(GetGoalInternalResponse.parse(read.body as unknown)).toMatchObject({ id: goal.id });

      const unchanged = await send('patch', `/internal/v1/goals/${goal.id}?today=${today}`, {
        headers: { 'If-Match': String(created.headers.etag) },
        body: { name: goal.name },
      });
      expect(unchanged.status, unchanged.text).toBe(200);
      expect(unchanged.headers.etag).toBe(created.headers.etag);
      UpdateGoalInternalResponse.parse(unchanged.body as unknown);

      const changed = await send('patch', `/internal/v1/goals/${goal.id}?today=${today}`, {
        headers: { 'If-Match': String(unchanged.headers.etag) },
        body: { name: 'Lancer le SSO' },
      });
      expect(changed.status, changed.text).toBe(200);
      const updated = UpdateGoalInternalResponse.parse(changed.body as unknown);
      expect(updated.version).toBe(goal.version + 1);
      const stale = await send('patch', `/internal/v1/goals/${goal.id}?today=${today}`, {
        headers: { 'If-Match': String(created.headers.etag) },
        body: { name: 'Ancienne version' },
      });
      expect(stale.status, stale.text).toBe(412);

      const resultBody = {
        kind: 'number',
        label: 'Organisations connectées',
        startValue: 0,
        currentValue: 4,
        targetValue: 10,
      };
      const headers = {
        'If-Match': String(changed.headers.etag),
        'Idempotency-Key': 'goal-result-1',
      };
      const added = await send('post', `/internal/v1/goals/${goal.id}/results`, {
        headers,
        body: resultBody,
      });
      expect(added.status, added.text).toBe(201);
      const result = CreateGoalResultInternalResponse.parse(added.body as unknown);
      expect(result).toMatchObject({ kind: 'number', progressPercent: 40 });
      expect(added.headers.location).toBe(`/v1/goals/${goal.id}/results/${result.id}`);
      const replay = await send('post', `/internal/v1/goals/${goal.id}/results`, {
        headers,
        body: resultBody,
      });
      expect(replay.status, replay.text).toBe(201);
      expect(replay.body).toEqual(added.body);
      expect(replay.headers.etag).toBe(added.headers.etag);
      const resultPath = `/internal/v1/goals/${goal.id}/results/${result.id}`;
      const retrieved = await send('get', resultPath);
      expect(retrieved.status, retrieved.text).toBe(200);
      expect(GetGoalResultInternalResponse.parse(retrieved.body as unknown)).toEqual(result);
      const resultNoop = await send('patch', resultPath, {
        body: { currentValue: 4 },
        headers: { 'If-Match': String(added.headers.etag) },
      });
      expect(resultNoop.status, resultNoop.text).toBe(200);
      expect(resultNoop.headers.etag).toBe(added.headers.etag);
      const resultChanged = await send('patch', resultPath, {
        body: { currentValue: 6 },
        headers: { 'If-Match': String(resultNoop.headers.etag) },
      });
      expect(resultChanged.status, resultChanged.text).toBe(200);
      expect(UpdateGoalResultInternalResponse.parse(resultChanged.body as unknown)).toMatchObject({
        progressPercent: 60,
      });
      const removed = await send('delete', resultPath, {
        headers: { 'If-Match': String(resultChanged.headers.etag) },
      });
      expect(removed.status, removed.text).toBe(204);
      expect((await send('get', resultPath)).status).toBe(404);
      const afterResult = await send('get', `/internal/v1/goals/${goal.id}?today=${today}`);
      expect(afterResult.status, afterResult.text).toBe(200);
      const erased = await send('delete', `/internal/v1/goals/${goal.id}`, {
        headers: { 'If-Match': String(afterResult.headers.etag) },
      });
      expect(erased.status, erased.text).toBe(204);
      expect((await send('get', `/internal/v1/goals/${goal.id}?today=${today}`)).status).toBe(404);
    });
  });

  describe('linked results respect current visibility', () => {
    it('locks a milestone before its goal space while another transaction updates the task', async () => {
      const createdSpace = await send('post', '/internal/v1/spaces', {
        body: { name: 'Verrous', prefix: 'VRR', visibility: 'private' },
      });
      expect(createdSpace.status, createdSpace.text).toBe(201);
      const space = CreateSpaceInternalResponse.parse(createdSpace.body as unknown);
      const createdTask = await send('post', `/internal/v1/lists/${space.firstList.id}/tasks`, {
        body: { name: 'Jalon', milestone: true },
      });
      expect(createdTask.status, createdTask.text).toBe(201);
      const task = CreateTaskInternalResponse.parse(createdTask.body as unknown);
      const created = await createGoal({ ...basicGoal, spaceId: space.space.id });
      const goal = CreateGoalInternalResponse.parse(created.body as unknown);
      if (db === undefined) throw new Error('Database did not start');
      const holder = await db.connect();
      let pending: Promise<request.Response> | undefined;
      try {
        await holder.query('begin');
        await holder.query("select set_config('app.system_access', 'on', true)");
        await holder.query("set local lock_timeout = '3s'");
        const pid = (await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]
          ?.pid;
        if (pid === undefined) throw new Error('Missing PostgreSQL backend PID');
        const [prefix, number] = task.key.split('-');
        await holder.query(
          'select id from tasks where organization_id = $1 and key_prefix = $2 and key_number = $3 for update',
          [organizationId, prefix, Number(number)],
        );
        pending = send('post', `/internal/v1/goals/${goal.id}/results`, {
          headers: {
            'If-Match': String(created.headers.etag),
            'Idempotency-Key': 'goal-lock-order',
          },
          body: { kind: 'milestone', label: 'Jalon tenu', taskKey: task.key },
        });
        let blocked = false;
        for (let attempt = 0; attempt < 100 && !blocked; attempt += 1) {
          const rows = await query<{ blocked: boolean }>(
            'select exists (select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))) as blocked',
            [pid],
          );
          blocked = rows[0]?.blocked === true;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        expect(blocked).toBe(true);
        await holder.query(
          'select id from spaces where organization_id = $1 and id = $2 for no key update',
          [organizationId, space.space.id],
        );
        await holder.query('commit');
        const result = await pending;
        expect(result.status, result.text).toBe(201);
      } finally {
        await holder.query('rollback');
        holder.release();
        await pending?.catch(() => undefined);
      }
    }, 20_000);

    it('accepts uppercase list UUIDs during creation and idempotent replay', async () => {
      const createdSpace = await send('post', '/internal/v1/spaces', {
        body: { name: 'Étude des objectifs', prefix: 'ETU', visibility: 'private' },
      });
      expect(createdSpace.status, createdSpace.text).toBe(201);
      const space = CreateSpaceInternalResponse.parse(createdSpace.body as unknown);
      const linked = {
        kind: 'list-progress',
        label: 'Avancement',
        listId: space.firstList.id.toUpperCase(),
      };
      const body = { ...basicGoal, spaceId: space.space.id, results: [linked] };
      const headers = { 'Idempotency-Key': 'goal-uppercase-list' };
      const first = await send('post', `/internal/v1/goals?today=${today}`, { headers, body });
      expect(first.status, first.text).toBe(201);
      const goal = CreateGoalInternalResponse.parse(first.body as unknown);
      const replay = await send('post', `/internal/v1/goals?today=${today}`, { headers, body });
      expect(replay.status, replay.text).toBe(201);
      expect(replay.body).toEqual(first.body);
      const resultHeaders = {
        'Idempotency-Key': 'goal-result-uppercase-list',
        'If-Match': String(first.headers.etag),
      };
      const resultPath = `/internal/v1/goals/${goal.id}/results`;
      const added = await send('post', resultPath, { headers: resultHeaders, body: linked });
      expect(added.status, added.text).toBe(201);
      const replayed = await send('post', resultPath, { headers: resultHeaders, body: linked });
      expect(replayed.status, replayed.text).toBe(201);
      expect(replayed.body).toEqual(added.body);
    });

    it('omits a private list from another member and from their progress denominator', async () => {
      const privateSpace = await send('post', '/internal/v1/spaces', {
        body: { name: 'Recherche', prefix: 'RCH', visibility: 'private' },
      });
      expect(privateSpace.status, privateSpace.text).toBe(201);
      const space = CreateSpaceInternalResponse.parse(privateSpace.body as unknown);
      const created = await createGoal({
        ...basicGoal,
        results: [
          { kind: 'checkbox', label: 'Documentation SSO publiée', checked: true },
          { kind: 'list-progress', label: 'Recherche confidentielle', listId: space.firstList.id },
        ],
      });
      const owner = CreateGoalInternalResponse.parse(created.body as unknown);
      expect(owner.progressPercent).toBe(50);
      const hiddenResult = owner.results.find((item) => item.kind === 'list-progress');
      if (hiddenResult === undefined) throw new Error('Missing linked result');
      const member = await send('get', `/internal/v1/goals/${owner.id}?today=${today}`, {
        actor: hugo,
      });
      expect(member.status, member.text).toBe(200);
      const view = GetGoalInternalResponse.parse(member.body as unknown);
      expect(view.progressPercent).toBe(100);
      expect(view.results).toHaveLength(1);
      expect(JSON.stringify(view)).not.toContain(space.firstList.id);
      const hidden = await send(
        'get',
        `/internal/v1/goals/${owner.id}/results/${hiddenResult.id}`,
        { actor: hugo },
      );
      expect(hidden.status, hidden.text).toBe(404);
      const privateGoal = await createGoal({
        ...basicGoal,
        name: 'Objectif de recherche privée',
        spaceId: space.space.id,
      });
      const privateId = CreateGoalInternalResponse.parse(privateGoal.body as unknown).id;
      const inaccessible = await send('get', `/internal/v1/goals/${privateId}?today=${today}`, {
        actor: hugo,
      });
      expect(inaccessible.status, inaccessible.text).toBe(404);
      await query(
        `insert into list_grants
          (organization_id,list_id,space_id,user_id,role,granted_by_type,granted_by_id)
         values ($1,$2,$3,$4,'view','user',$5)`,
        [organizationId, space.firstList.id, space.space.id, hugo, camille],
      );
      const sharedList = await send('get', `/internal/v1/lists/${space.firstList.id}`, {
        actor: hugo,
      });
      expect(sharedList.status, sharedList.text).toBe(200);
      const listOnly = await send('get', `/internal/v1/goals/${privateId}?today=${today}`, {
        actor: hugo,
      });
      expect(listOnly.status, listOnly.text).toBe(404);
      const guest = await send('get', `/internal/v1/goals/${owner.id}?today=${today}`, {
        actor: nadia,
      });
      expect(guest.status, guest.text).toBe(404);
      const guestList = await send('get', `/internal/v1/goals?quarter=2026-Q4&today=${today}`, {
        actor: nadia,
      });
      expect(guestList.status, guestList.text).toBe(200);
      expect(
        ListGoalsInternalResponse.parse(guestList.body as unknown).items.map((item) => item.id),
      ).not.toContain(owner.id);
      const otherTenant = await send('get', `/internal/v1/goals/${owner.id}?today=${today}`, {
        org: randomUUID(),
      });
      expect(otherTenant.status, otherTenant.text).toBe(404);
    });
  });

  describe('idempotent goal creation checks current authorization', () => {
    it('keeps an organization goal intact while its membership proof and projection disagree', async () => {
      const created = await createGoal({ ...basicGoal, name: 'Objectif conservé' });
      expect(created.status, created.text).toBe(201);
      const { id } = CreateGoalInternalResponse.parse(created.body as unknown);
      if (app === undefined) throw new Error('Application did not start');
      const authority = app.get(ReadCurrentMembership);
      const stamp = await authority.execute(organizationId, camille);
      if (stamp === null) throw new Error('Missing fixture membership');
      vi.spyOn(authority, 'execute').mockResolvedValueOnce({
        ...stamp,
        role: 'member',
        version: stamp.version + 1,
      });
      const denied = await send('delete', `/internal/v1/goals/${id}`);
      expect(denied.status, denied.text).toBe(404);
      const unchanged = await send('get', `/internal/v1/goals/${id}?today=${today}`);
      expect(unchanged.status, unchanged.text).toBe(200);
    });

    it('replays an authorized result with the original stale ETag, then rejects after role removal', async () => {
      const created = await createGoal({ ...basicGoal, name: 'Objectif avec rejeu' });
      const goal = CreateGoalInternalResponse.parse(created.body as unknown);
      const path = `/internal/v1/goals/${goal.id}/results`;
      const body = { kind: 'checkbox', label: 'Revue de sécurité', checked: false };
      const headers = {
        'If-Match': String(created.headers.etag),
        'Idempotency-Key': 'goal-replay-authorized',
      };
      const first = await send('post', path, { body, headers });
      expect(first.status, first.text).toBe(201);
      const replay = await send('post', path, { body, headers });
      expect(replay.status, replay.text).toBe(201);
      expect(replay.body).toEqual(first.body);
      await query(
        `update organization_members set role = 'member' where organization_id = $1 and user_id = $2`,
        [organizationId, camille],
      );
      try {
        const revoked = await send('post', path, { body, headers });
        expect(revoked.status, revoked.text).toBe(403);
      } finally {
        await query(
          `update organization_members set role = 'owner' where organization_id = $1 and user_id = $2`,
          [organizationId, camille],
        );
      }
      const after = await send('get', `/internal/v1/goals/${goal.id}?today=${today}`);
      expect(after.status, after.text).toBe(200);
      expect(GetGoalInternalResponse.parse(after.body as unknown).results).toHaveLength(2);
    });
  });
});
