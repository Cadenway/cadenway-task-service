import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  CreateSpaceInternalResponse,
  CreateTaskInternalResponse,
  GetTaskApprovalInternalResponse,
  RequestTaskApprovalInternalResponse,
  VoteOnTaskApprovalInternalResponse,
  TrashTaskInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { eventSchemas } from '@cadenway/contracts/events/task-service';
import { createApplication, InternalTokenSigner, loadConfig } from '@cadenway/nest-common';
import type { Ed25519PublicJwk } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import { mirrorCurrentMembership } from './support/current-membership.fixture.js';

const project = `task-approval-test-${String(process.pid)}`;
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

describe('task approvals with PostgreSQL and NATS', () => {
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
    const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'approval-test' };
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

  async function current(key: string): Promise<request.Response> {
    const result = await send('get', `/internal/v1/tasks/${key}/approvals`);
    expect(result.status, result.text).toBe(200);
    GetTaskApprovalInternalResponse.parse(result.body as unknown);
    return result;
  }

  async function openRound(
    key: string,
    reviewers: readonly string[],
  ): Promise<{ roundId: string; etag: string }> {
    const initial = await current(key);
    const result = await send('post', `/internal/v1/tasks/${key}/approvals/request`, {
      headers: { 'If-Match': String(initial.headers.etag) },
      body: { reviewerUserIds: reviewers },
    });
    expect(result.status, result.text).toBe(200);
    const state = RequestTaskApprovalInternalResponse.parse(result.body as unknown);
    expect(result.headers.etag).toBe(`"${String(state.taskVersion)}"`);
    if (state.current === null) throw new Error('The approval round was not returned');
    return { roundId: state.current.roundId, etag: String(result.headers.etag) };
  }

  describe('approval decisions preserve the task version and review rules', () => {
    it('requires the current ETag, records one vote, withdraws and keeps the task status', async () => {
      const key = await task('Vérifier la maquette Sprint 14');
      const base = await current(key);
      expect(GetTaskApprovalInternalResponse.parse(base.body as unknown).current).toBeNull();
      const round = await openRound(key, [camille, hugo]);
      const path = `/internal/v1/tasks/${key}/approvals/${round.roundId}/votes/me`;
      const stale = await send('put', path, {
        body: { decision: 'approved' },
        headers: { 'If-Match': String(base.headers.etag) },
      });
      expect(stale.status, stale.text).toBe(412);
      const missing = await send('put', path, { body: { decision: 'approved' } });
      expect(missing.status, missing.text).toBe(400);
      const approved = await send('put', path, {
        body: { decision: 'approved' },
        headers: { 'If-Match': round.etag },
      });
      expect(approved.status, approved.text).toBe(200);
      const state = VoteOnTaskApprovalInternalResponse.parse(approved.body as unknown);
      expect(state.current?.status).toBe('pending');
      expect(state.taskStatus).toBe('todo');
      const again = await send('put', path, {
        body: { decision: 'approved' },
        headers: { 'If-Match': String(approved.headers.etag) },
      });
      expect(again.status, again.text).toBe(409);
      const withdrawn = await send('delete', path, {
        headers: { 'If-Match': String(approved.headers.etag) },
      });
      expect(withdrawn.status, withdrawn.text).toBe(204);
      const after = await current(key);
      expect(after.headers.etag).toBe(withdrawn.headers.etag);
      expect(GetTaskApprovalInternalResponse.parse(after.body as unknown).taskStatus).toBe('todo');
      const unchanged = await send('delete', path, {
        headers: { 'If-Match': String(withdrawn.headers.etag) },
      });
      expect(unchanged.status, unchanged.text).toBe(204);
      expect(unchanged.headers.etag).toBe(withdrawn.headers.etag);
    });

    it('moves the task to done only after every eligible reviewer approves', async () => {
      const key = await task('Valider le parcours de connexion');
      const round = await openRound(key, [camille, hugo]);
      const path = `/internal/v1/tasks/${key}/approvals/${round.roundId}/votes/me`;
      const first = await send('put', path, {
        body: { decision: 'approved' },
        headers: { 'If-Match': round.etag },
      });
      expect(first.status, first.text).toBe(200);
      const second = await send('put', path, {
        actor: hugo,
        body: { decision: 'approved' },
        headers: { 'If-Match': String(first.headers.etag) },
      });
      expect(second.status, second.text).toBe(200);
      const state = VoteOnTaskApprovalInternalResponse.parse(second.body as unknown);
      expect(state.taskStatus).toBe('done');
      expect(state.current?.status).toBe('approved');
    });

    it('serializes concurrent approvals and commits only the retried reviewer vote', async () => {
      const key = await task('Valider ensemble le parcours de connexion');
      const round = await openRound(key, [camille, hugo]);
      const path = `/internal/v1/tasks/${key}/approvals/${round.roundId}/votes/me`;
      const contenders = [camille, hugo] as const;
      const replies = await Promise.all(
        contenders.map((actor) =>
          send('put', path, {
            actor,
            body: { decision: 'approved' },
            headers: { 'If-Match': round.etag },
          }),
        ),
      );
      expect(replies.map((reply) => reply.status).sort()).toEqual([200, 412]);
      const winner = replies.find((reply) => reply.status === 200);
      const loserIndex = replies.findIndex((reply) => reply.status === 412);
      const loser = contenders[loserIndex];
      if (winner === undefined || loser === undefined) throw new Error('Missing concurrent vote');
      const winningState = VoteOnTaskApprovalInternalResponse.parse(winner.body as unknown);
      expect(winningState.taskStatus).toBe('todo');
      expect(winningState.current?.status).toBe('pending');
      expect(
        winningState.current?.reviewers.filter((reviewer) => reviewer.decision === 'approved'),
      ).toHaveLength(1);
      const factsBeforeRetry = await query<{ event_name: string; payload: { version: number } }>(
        `select event_name, payload from outbox_events where organization_id = $1
         and payload ->> 'key' = $2 and event_name in ('approval.decided.v1', 'task.status-changed.v1')`,
        [organizationId, key],
      );
      expect(factsBeforeRetry.map((fact) => fact.event_name)).toEqual(['approval.decided.v1']);
      expect(factsBeforeRetry[0]?.payload.version).toBe(winningState.taskVersion);
      const activityBeforeRetry = await query<{ count: number }>(
        `select count(*)::int as count from activity_entries a join tasks t
         on t.organization_id = a.organization_id and t.id = a.task_id
         where t.organization_id = $1 and t.key_prefix = 'CAD' and t.key_number = $2
           and a.kind = 'status'`,
        [organizationId, Number(key.split('-')[1])],
      );
      expect(activityBeforeRetry).toEqual([{ count: 0 }]);

      const retried = await send('put', path, {
        actor: loser,
        body: { decision: 'approved' },
        headers: { 'If-Match': String(winner.headers.etag) },
      });
      expect(retried.status, retried.text).toBe(200);
      const final = VoteOnTaskApprovalInternalResponse.parse(retried.body as unknown);
      expect(final.taskVersion).toBe(winningState.taskVersion + 1);
      expect(final.taskStatus).toBe('done');
      expect(final.current?.status).toBe('approved');
      expect(final.current?.reviewers.map((reviewer) => reviewer.decision)).toEqual([
        'approved',
        'approved',
      ]);
      const facts = await query<{ event_name: string; payload: { version: number } }>(
        `select event_name, payload from outbox_events where organization_id = $1
         and payload ->> 'key' = $2 and event_name in ('approval.decided.v1', 'task.status-changed.v1')`,
        [organizationId, key],
      );
      expect(facts.filter((fact) => fact.event_name === 'approval.decided.v1')).toHaveLength(2);
      const transitions = facts.filter((fact) => fact.event_name === 'task.status-changed.v1');
      expect(transitions).toHaveLength(1);
      expect(transitions[0]?.payload.version).toBe(final.taskVersion);
      const activity = await query<{ status_from: string; status_to: string }>(
        `select a.status_from, a.status_to from activity_entries a join tasks t
         on t.organization_id = a.organization_id and t.id = a.task_id
         where t.organization_id = $1 and t.key_prefix = 'CAD' and t.key_number = $2
           and a.kind = 'status'`,
        [organizationId, Number(key.split('-')[1])],
      );
      expect(activity).toEqual([{ status_from: 'todo', status_to: 'done' }]);
    });
  });

  describe('review visibility follows current membership and task visibility', () => {
    it('does not disclose a newer version after task access is revoked while a vote waits', async () => {
      const key = await task('Revue après révocation concurrente');
      const round = await openRound(key, [camille, hugo]);
      if (db === undefined) throw new Error('Database did not start');
      const client = await db.connect();
      let pending: Promise<request.Response> | undefined;
      try {
        await client.query('begin');
        await client.query("select set_config('app.system_access', 'on', true)");
        const locked = await client.query<{ id: string }>(
          `select id from tasks where organization_id = $1 and key_prefix = 'CAD'
           and key_number = $2 for no key update`,
          [organizationId, Number(key.split('-')[1])],
        );
        const taskId = locked.rows[0]?.id;
        if (taskId === undefined) throw new Error('Task was not locked');
        pending = send('put', `/internal/v1/tasks/${key}/approvals/${round.roundId}/votes/me`, {
          actor: hugo,
          body: { decision: 'approved' },
          headers: { 'If-Match': round.etag },
        });
        await expect
          .poll(
            async () => {
              const locks = await query<{ waiting: string }>(
                'select count(*)::text as waiting from pg_locks where not granted',
              );
              return Number(locks[0]?.waiting ?? 0);
            },
            { timeout: 3_000, interval: 50 },
          )
          .toBeGreaterThan(0);
        await client.query(
          `update lists set organization_access = false where organization_id = $1 and id = $2`,
          [organizationId, listId],
        );
        await client.query(
          'update tasks set version = version + 1 where organization_id = $1 and id = $2',
          [organizationId, taskId],
        );
        await client.query('commit');
        const refused = await pending;
        expect(refused.status, refused.text).toBe(404);
        expect(refused.body).toMatchObject({ code: 'task.not-found' });
        expect(refused.body).not.toHaveProperty('details.version');
        const votes = await query<{ decision: string | null }>(
          `select decision from task_approval_reviewers where organization_id = $1
           and round_id = $2 and reviewer_user_id = $3`,
          [organizationId, round.roundId, hugo],
        );
        expect(votes).toEqual([{ decision: null }]);
      } finally {
        await client.query('rollback');
        client.release();
        await query(
          'update lists set organization_access = true where organization_id = $1 and id = $2',
          [organizationId, listId],
        );
        await pending?.catch(() => undefined);
      }
    }, 30_000);

    it('omits a removed reviewer and rejects their next request', async () => {
      const key = await task('Revue après départ');
      const round = await openRound(key, [camille, hugo]);
      await query('delete from organization_members where organization_id = $1 and user_id = $2', [
        organizationId,
        hugo,
      ]);
      try {
        const state = GetTaskApprovalInternalResponse.parse((await current(key)).body as unknown);
        expect(state.current?.reviewers.map((reviewer) => reviewer.reviewerUserId)).toEqual([
          camille,
        ]);
        const refused = await send(
          'put',
          `/internal/v1/tasks/${key}/approvals/${round.roundId}/votes/me`,
          {
            actor: hugo,
            body: { decision: 'approved' },
            headers: { 'If-Match': round.etag },
          },
        );
        expect([403, 404]).toContain(refused.status);
      } finally {
        await query(
          `insert into organization_members (organization_id,id,user_id,role,version)
          values ($1,$2,$3,'member',1)`,
          [organizationId, randomUUID(), hugo],
        );
      }
      const other = await send('get', `/internal/v1/tasks/${key}/approvals`, { org: randomUUID() });
      expect(other.status, other.text).toBe(404);
    });

    it('returns no approval for a milestone and refuses a new round', async () => {
      const key = await task('Jalon Sprint 14', { milestone: true });
      const before = await current(key);
      expect(GetTaskApprovalInternalResponse.parse(before.body as unknown).current).toBeNull();
      const refused = await send('post', `/internal/v1/tasks/${key}/approvals/request`, {
        body: { reviewerUserIds: [camille] },
        headers: { 'If-Match': String(before.headers.etag) },
      });
      expect(refused.status, refused.text).toBe(409);
    });
  });

  describe('approval writes keep comments and facts in the task transaction', () => {
    it('rolls back unanimous approval when the successor date is outside the supported range', async () => {
      const key = await task('Échéance maximale', {
        dueDate: '9999-12-31',
        recurrence: 'monthly',
      });
      const round = await openRound(key, [camille]);
      const count = async (): Promise<readonly unknown[]> =>
        query(
          `select (select count(*)::int from tasks where organization_id = $1) as tasks,
                  (select count(*)::int from outbox_events where organization_id = $1) as facts`,
          [organizationId],
        );
      const before = await count();
      const refused = await send(
        'put',
        `/internal/v1/tasks/${key}/approvals/${round.roundId}/votes/me`,
        { body: { decision: 'approved' }, headers: { 'If-Match': round.etag } },
      );
      expect(refused.status, refused.text).toBe(422);
      expect(refused.body).toMatchObject({ code: 'recurrence.date-out-of-range' });
      const after = await current(key);
      expect(after.headers.etag).toBe(round.etag);
      expect(GetTaskApprovalInternalResponse.parse(after.body as unknown)).toMatchObject({
        taskStatus: 'todo',
        current: { status: 'pending', reviewers: [{ decision: null }] },
      });
      expect(await count()).toEqual(before);
    });

    it('rolls back the vote, comment, task and facts when a requested status is hidden', async () => {
      const spaceResponse = await send('post', '/internal/v1/spaces', {
        body: { name: 'Marketing', prefix: 'MKT', visibility: 'organization' },
      });
      expect(spaceResponse.status, spaceResponse.text).toBe(201);
      const space = CreateSpaceInternalResponse.parse(spaceResponse.body as unknown);
      const hidden = await send('patch', `/internal/v1/spaces/${space.space.id}`, {
        body: { statuses: { progress: { hidden: true } } },
      });
      expect(hidden.status, hidden.text).toBe(200);
      const created = await send('post', `/internal/v1/lists/${space.firstList.id}/tasks`, {
        body: { name: 'Valider la campagne' },
      });
      expect(created.status, created.text).toBe(201);
      const key = CreateTaskInternalResponse.parse(created.body as unknown).key;
      const round = await openRound(key, [camille]);
      const before = await query<{ count: number }>(
        `select count(*)::int as count from outbox_events where organization_id = $1 and payload ->> 'key' = $2`,
        [organizationId, key],
      );
      const denied = await send(
        'put',
        `/internal/v1/tasks/${key}/approvals/${round.roundId}/votes/me`,
        {
          body: { decision: 'changes-requested', reason: 'Vérifier les étapes.' },
          headers: { 'If-Match': round.etag },
        },
      );
      expect(denied.status, denied.text).toBe(422);
      expect(denied.body).toMatchObject({ code: 'task.status-hidden' });
      const after = await current(key);
      expect(after.headers.etag).toBe(round.etag);
      expect(GetTaskApprovalInternalResponse.parse(after.body as unknown)).toMatchObject({
        taskStatus: 'todo',
        current: { status: 'pending', reviewers: [{ decision: null }] },
      });
      expect(
        await query<{ count: number }>(
          `select count(*)::int as count from outbox_events where organization_id = $1 and payload ->> 'key' = $2`,
          [organizationId, key],
        ),
      ).toEqual(before);
      expect(
        await query<{ count: number }>(
          `select count(*)::int as count from task_comments c join tasks t
         on t.organization_id = c.organization_id and t.id = c.task_id
         where t.organization_id = $1 and t.key_prefix = 'MKT' and t.key_number = $2`,
          [organizationId, Number(key.split('-')[1])],
        ),
      ).toEqual([{ count: 0 }]);
    });

    it('creates a comment for a change request and publishes text-free approval facts', async () => {
      const key = await task('Préparer la revue d’interface');
      const round = await openRound(key, [camille, hugo]);
      const reason = 'Merci de vérifier le parcours de connexion.';
      const voted = await send(
        'put',
        `/internal/v1/tasks/${key}/approvals/${round.roundId}/votes/me`,
        {
          body: { decision: 'changes-requested', reason },
          headers: { 'If-Match': round.etag },
        },
      );
      expect(voted.status, voted.text).toBe(200);
      const state = VoteOnTaskApprovalInternalResponse.parse(voted.body as unknown);
      expect(state.taskStatus).toBe('progress');
      expect(state.current?.status).toBe('changes-requested');
      const commentId = state.current?.reviewers.find(
        (reviewer) => reviewer.reviewerUserId === camille,
      )?.commentId;
      expect(commentId).toBeTruthy();
      const comment = await send('get', `/internal/v1/tasks/${key}/comments/${String(commentId)}`);
      expect(comment.status, comment.text).toBe(200);
      expect(comment.body).toMatchObject({ body: reason });
      const facts = await query<{ event_name: string; payload: unknown }>(
        `select event_name, payload from outbox_events where organization_id = $1
         and payload ->> 'key' = $2 and event_name in ('approval.requested.v1', 'approval.decided.v1')
         order by created_at, id`,
        [organizationId, key],
      );
      expect(facts).toHaveLength(2);
      for (const fact of facts) {
        const schema =
          fact.event_name === 'approval.requested.v1'
            ? eventSchemas['approval.requested.v1']
            : eventSchemas['approval.decided.v1'];
        expect(schema.safeParse(fact.payload).success).toBe(true);
        expect(JSON.stringify(fact.payload)).not.toContain(reason);
      }
      await expect
        .poll(
          () => {
            const raw = compose(
              'exec',
              '-T',
              'nats-streams',
              'nats',
              'req',
              '--raw',
              '$JS.API.STREAM.MSG.GET.EVENTS',
              JSON.stringify({ last_by_subj: 'evt.approval.decided.v1' }),
            );
            const envelope = JSON.parse(raw) as { message?: { data?: string } };
            if (envelope.message?.data === undefined) return null;
            return JSON.parse(
              Buffer.from(envelope.message.data, 'base64').toString('utf8'),
            ) as unknown;
          },
          { timeout: 15_000, interval: 200 },
        )
        .toMatchObject({ key, roundId: round.roundId, decision: 'changes-requested', commentId });
      const activity = await query<{ count: number }>(
        `select count(*)::int as count from activity_entries where organization_id = $1 and comment_id = $2`,
        [organizationId, commentId],
      );
      expect(activity[0]?.count).toBe(1);
    });

    it('keeps historical rounds and removes them with the purged task', async () => {
      const key = await task('Rondes conservées');
      const first = await openRound(key, [camille]);
      const second = await openRound(key, [hugo]);
      expect(second.roundId).not.toBe(first.roundId);
      const rounds = await query<{ id: string; closed_at: Date | null }>(
        `select id, closed_at from task_approval_rounds where organization_id = $1
         and id in ($2, $3) order by id`,
        [organizationId, first.roundId, second.roundId],
      );
      expect(rounds).toHaveLength(2);
      expect(rounds.find((row) => row.id === first.roundId)?.closed_at).toBeInstanceOf(Date);
      const trashed = await send('post', `/internal/v1/tasks/${key}/trash`, { body: {} });
      expect(trashed.status, trashed.text).toBe(200);
      const entry = TrashTaskInternalResponse.parse(trashed.body as unknown);
      const deleted = await send('delete', `/internal/v1/trash/entries/${entry.id}`);
      expect(deleted.status, deleted.text).toBe(204);
      expect(
        await query(
          'select id from task_approval_rounds where organization_id = $1 and id in ($2, $3)',
          [organizationId, first.roundId, second.roundId],
        ),
      ).toHaveLength(0);
      expect(
        await query(
          'select round_id from task_approval_reviewers where organization_id = $1 and round_id in ($2, $3)',
          [organizationId, first.roundId, second.roundId],
        ),
      ).toHaveLength(0);
    });
  });
});
