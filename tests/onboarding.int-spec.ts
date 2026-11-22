import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  CreateTaskInternalResponse,
  FinishOnboardingInternalResponse,
  GetOnboardingInternalResponse,
  UpdateOnboardingChecklistInternalResponse,
  UpdateOnboardingInternalResponse,
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

const project = `onboarding-test-${String(process.pid)}`;
const organizationId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const otherOrganization = '01938f6e-0000-7000-8000-000000000002';
const camille = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e11';
const hugo = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e12';
const guest = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e13';
const member = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e14';
const developer = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e15';
const marketer = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e16';
const agent = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e17';
const replayMember = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e18';
const concurrentMember = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e19';
const sameKeyMember = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e20';
const draftMember = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e21';
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

describe('onboarding with PostgreSQL and NATS', () => {
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
    method: 'get' | 'post' | 'patch' | 'put',
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

  const onboarding = (userId: string): string => `/internal/v1/users/${userId}/onboarding`;

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
    for (const [userId, role] of [
      [camille, 'owner'],
      [hugo, 'member'],
      [guest, 'guest'],
      [member, 'member'],
      [developer, 'member'],
      [marketer, 'member'],
      [agent, 'member'],
      [replayMember, 'member'],
      [concurrentMember, 'member'],
      [sameKeyMember, 'member'],
      [draftMember, 'member'],
    ]) {
      await query(
        'insert into organization_members (organization_id,id,user_id,role,version) values ($1,$2,$3,$4,1)',
        [organizationId, randomUUID(), userId, role],
      );
    }
    await query(
      'insert into organization_members (organization_id,id,user_id,role,version) values ($1,$2,$3,$4,1)',
      [otherOrganization, randomUUID(), camille, 'owner'],
    );
    const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
    if (x === undefined || d === undefined) throw new Error('Missing test key material');
    const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'onboarding-test' };
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
    mirrorCurrentMembership(app);
    signer = await InternalTokenSigner.create({
      issuer: 'api-gateway',
      privateJwk: { ...publicJwk, d },
    });
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

  describe('the wizard belongs to its current member and organization', () => {
    it('isolates drafts and checklist markers and applies optimistic versions', async () => {
      const first = await send('get', onboarding(camille));
      expect(first.status, first.text).toBe(200);
      const initial = GetOnboardingInternalResponse.parse(first.body as unknown);
      expect(initial.version).toBe(1);
      expect(first.headers.etag).toBe('"1"');
      expect((await send('get', onboarding(hugo))).status).toBe(404);

      const changed = await send('patch', onboarding(camille), {
        headers: { 'If-Match': '"1"' },
        body: { step: 'preset', name: 'Atelier Nord', prefix: 'CAD' },
      });
      expect(changed.status, changed.text).toBe(200);
      const draft = UpdateOnboardingInternalResponse.parse(changed.body as unknown);
      expect(draft.wizard).toMatchObject({ step: 'preset', name: 'Atelier Nord', prefix: 'CAD' });
      expect(changed.headers.etag).toBe(`"${String(draft.version)}"`);
      expect(
        (
          await send('patch', onboarding(camille), {
            headers: { 'If-Match': '"1"' },
            body: { step: 'team' },
          })
        ).status,
      ).toBe(412);
      const invitation = await send('patch', `${onboarding(camille)}/checklist`, {
        headers: { 'If-Match': `"${String(draft.version)}"` },
        body: { invitationSent: true },
      });
      expect(invitation.status, invitation.text).toBe(200);
      expect(
        UpdateOnboardingChecklistInternalResponse.parse(invitation.body as unknown).checklist
          .invitationSent,
      ).toBe(true);
      const other = await send('get', onboarding(camille), { org: otherOrganization });
      expect(other.status, other.text).toBe(200);
      expect(GetOnboardingInternalResponse.parse(other.body as unknown)).toEqual(initial);
    });

    it('allows a guest to dismiss but requires the space creation role to finish', async () => {
      const refused = await send('post', `${onboarding(guest)}/finish`, {
        actor: guest,
        body: { name: 'Produit', prefix: 'GST', preset: 'blank' },
      });
      expect(refused.status, refused.text).toBe(403);
      const dismissed = await send('patch', onboarding(guest), {
        actor: guest,
        body: { dismissed: true },
      });
      expect(dismissed.status, dismissed.text).toBe(200);
      expect(UpdateOnboardingInternalResponse.parse(dismissed.body as unknown).wizard.status).toBe(
        'dismissed',
      );
      expect(
        (await send('patch', onboarding(guest), { actor: guest, body: { step: 'team' } })).status,
      ).toBe(409);
    });

    it('dismisses with combined edits while preserving the previously saved draft', async () => {
      const saved = await send('patch', onboarding(draftMember), {
        actor: draftMember,
        body: { name: 'Produit', step: 'preset', prefix: 'DRF' },
      });
      expect(saved.status, saved.text).toBe(200);
      const original = UpdateOnboardingInternalResponse.parse(saved.body as unknown);
      const dismissed = await send('patch', onboarding(draftMember), {
        actor: draftMember,
        body: { dismissed: true, name: 'Autre', step: 'team' },
      });
      expect(dismissed.status, dismissed.text).toBe(200);
      const state = UpdateOnboardingInternalResponse.parse(dismissed.body as unknown);
      expect(state.wizard).toMatchObject({
        name: original.wizard.name,
        step: original.wizard.step,
        status: 'dismissed',
      });
      expect(state.version).toBe(original.version + 1);
      const retry = await send('patch', onboarding(draftMember), {
        actor: draftMember,
        body: { dismissed: true, name: 'Autre', step: 'team' },
      });
      expect(retry.status, retry.text).toBe(200);
      expect(UpdateOnboardingInternalResponse.parse(retry.body as unknown)).toEqual(state);
    });

    it('returns a body issue for a whitespace-only name before and during finish', async () => {
      for (const [method, path, body] of [
        ['patch', onboarding(member), { name: '   ' }],
        ['post', `${onboarding(member)}/finish`, { name: '   ', prefix: 'NAM', preset: 'blank' }],
      ] as const) {
        const response = await send(method, path, { actor: member, body });
        expect(response.status, response.text).toBe(400);
        expect(response.body as unknown).toMatchObject({ code: 'request.invalid' });
        const problem = response.body as { details: { issues: readonly unknown[] } };
        expect(problem.details.issues).toContainEqual(
          expect.objectContaining({ in: 'body', path: 'name' }),
        );
      }
    });
  });

  describe('finishing provisions one space and normal events atomically', () => {
    it.each([
      {
        actor: developer,
        preset: 'dev',
        prefix: 'DEV',
        lists: ['Backlog', 'Sprint 1', 'Bugs'],
        tasks: [
          'Définir le périmètre du premier sprint',
          'Configurer l’intégration continue',
          'Corriger le bug de connexion',
        ],
      },
      {
        actor: marketer,
        preset: 'mkt',
        prefix: 'MKT',
        lists: ['Calendrier éditorial', 'Campagnes'],
        tasks: [
          'Planifier les articles de décembre',
          'Préparer la campagne de rentrée',
          'Mettre à jour la page tarifs',
        ],
      },
      {
        actor: agent,
        preset: 'agency',
        prefix: 'AGN',
        lists: ['Projets clients', 'Demandes'],
        tasks: [
          'Lancer le projet Studio Pixel',
          'Valider le devis Lumen',
          'Envoyer le compte rendu de réunion',
        ],
      },
      { actor: camille, preset: 'blank', prefix: 'CAD', lists: ['Première liste'], tasks: [] },
    ])(
      'creates the $preset preset and replays the same creation',
      async ({ actor, preset, prefix, lists, tasks }) => {
        const headers = { 'Idempotency-Key': `finish-${preset}` };
        const input = { name: `Espace ${preset}`, prefix, preset };
        const first = await send('post', `${onboarding(actor)}/finish`, {
          actor,
          headers,
          body: input,
        });
        expect(first.status, first.text).toBe(201);
        const state = FinishOnboardingInternalResponse.parse(first.body as unknown);
        expect(state.wizard.status).toBe('finished');
        expect(state.provisioning).not.toBeNull();
        if (state.provisioning === null) throw new Error('Expected a provisioned space');
        expect(state.checklist.firstTaskCreated).toBe(false);
        const spaceId = state.provisioning.spaceId;
        expect(first.headers.location).toBe(`/internal/v1/spaces/${spaceId}`);
        expect(first.headers.etag).toBe(`"${String(state.version)}"`);
        const replay = await send('post', `${onboarding(actor)}/finish`, {
          actor,
          headers,
          body: input,
        });
        expect(replay.status, replay.text).toBe(201);
        expect(replay.body).toEqual(first.body);
        expect(replay.headers.location).toBe(first.headers.location);
        const staleReplay = await send('post', `${onboarding(actor)}/finish`, {
          actor,
          headers: { ...headers, 'If-Match': '"1"' },
          body: input,
        });
        expect(staleReplay.status, staleReplay.text).toBe(201);
        expect(staleReplay.body).toEqual(first.body);
        expect(staleReplay.headers.location).toBe(first.headers.location);
        expect(staleReplay.headers.etag).toBe(first.headers.etag);
        const invalidCondition = await send('post', `${onboarding(actor)}/finish`, {
          actor,
          headers: { ...headers, 'If-Match': '**' },
          body: input,
        });
        expect(invalidCondition.status, invalidCondition.text).toBe(400);
        expect(invalidCondition.body as unknown).toMatchObject({ code: 'request.invalid' });
        const invalidProblem = invalidCondition.body as { details: { issues: readonly unknown[] } };
        expect(invalidProblem.details.issues).toContainEqual(
          expect.objectContaining({ in: 'header', path: 'If-Match' }),
        );
        expect(
          (
            await send('post', `${onboarding(actor)}/finish`, {
              actor,
              headers,
              body: { ...input, name: 'Autre espace' },
            })
          ).status,
        ).toBe(422);

        const actualLists = await query<{ id: string; name: string }>(
          'select id, name from lists where organization_id = $1 and space_id = $2',
          [organizationId, spaceId],
        );
        expect(actualLists.map((row) => row.name).sort()).toEqual([...lists].sort());
        expect(actualLists.some((row) => row.id === state.provisioning?.firstListId)).toBe(true);
        const actualTasks = await query<{ name: string; status: string }>(
          'select name, status from tasks where organization_id = $1 and space_id = $2',
          [organizationId, spaceId],
        );
        expect(actualTasks.map((row) => row.name).sort()).toEqual([...tasks].sort());
        if (tasks.length > 0)
          expect(actualTasks.find((row) => row.name === tasks[0])?.status).toBe('progress');
        const assignments = await query<{ name: string; user_id: string }>(
          `select task.name, assignee.user_id from tasks as task
           join task_assignees as assignee on assignee.organization_id = task.organization_id and assignee.task_id = task.id
           where task.organization_id = $1 and task.space_id = $2`,
          [organizationId, spaceId],
        );
        expect(assignments.map((row) => row.name).sort()).toEqual([...tasks].sort());
        expect(assignments.every((row) => row.user_id === actor)).toBe(true);
        const events = await query<{ event_name: string; total: number }>(
          `select event_name, count(*)::int as total from outbox_events
         where organization_id = $1 and payload->>'spaceId' = $2
         and event_name in ('space.created.v1', 'list.created.v1', 'task.created.v1') group by event_name`,
          [organizationId, spaceId],
        );
        const counts = new Map(events.map((event) => [event.event_name, event.total]));
        expect(counts.get('space.created.v1')).toBe(1);
        expect(counts.get('list.created.v1')).toBe(lists.length);
        expect(counts.get('task.created.v1') ?? 0).toBe(tasks.length);
        const eventActors = await query<{ actor_id: string; actor_type: string }>(
          `select payload->'actor'->>'id' as actor_id, payload->'actor'->>'type' as actor_type
           from outbox_events where organization_id = $1 and payload->>'spaceId' = $2
           and event_name in ('space.created.v1', 'list.created.v1', 'task.created.v1')`,
          [organizationId, spaceId],
        );
        expect(eventActors).toHaveLength(1 + lists.length + tasks.length);
        expect(
          eventActors.every((row) => row.actor_id === actor && row.actor_type === 'user'),
        ).toBe(true);
      },
    );

    it('refuses replay after the member leaves', async () => {
      const headers = { 'Idempotency-Key': 'finish-removed-member' };
      const input = { name: 'Espace révocation', prefix: 'REV', preset: 'blank' };
      const first = await send('post', `${onboarding(replayMember)}/finish`, {
        actor: replayMember,
        headers,
        body: input,
      });
      expect(first.status, first.text).toBe(201);
      await query(
        'update organization_members set removed_at = now() where organization_id = $1 and user_id = $2',
        [organizationId, replayMember],
      );
      const replay = await send('post', `${onboarding(replayMember)}/finish`, {
        actor: replayMember,
        headers,
        body: input,
      });
      expect(replay.status, replay.text).toBe(404);
      expect(
        await query<{ count: number }>(
          'select count(*)::int as count from spaces where organization_id = $1 and prefix = $2',
          [organizationId, 'REV'],
        ),
      ).toEqual([{ count: 1 }]);
    });

    it('serializes two finishes with different keys into one provisioned space', async () => {
      const actor = concurrentMember;
      const seed = await send('patch', onboarding(actor), { actor, body: { step: 'preset' } });
      expect(seed.status, seed.text).toBe(200);
      if (db === undefined) throw new Error('Database did not start');
      const client = await db.connect();
      let first: Promise<request.Response> | undefined;
      let second: Promise<request.Response> | undefined;
      try {
        await client.query('begin');
        await client.query("select set_config('app.system_access', 'on', true)");
        await client.query(
          'select user_id from onboarding_states where organization_id = $1 and user_id = $2 for update',
          [organizationId, actor],
        );
        const body = { name: 'Concurrence', prefix: 'CON', preset: 'blank' };
        first = send('post', `${onboarding(actor)}/finish`, {
          actor,
          headers: { 'Idempotency-Key': 'concurrent-first' },
          body,
        });
        await expect
          .poll(
            async () =>
              Number(
                (
                  await query<{ waiting: string }>(
                    'select count(*)::text as waiting from pg_locks where not granted',
                  )
                )[0]?.waiting ?? 0,
              ),
            { timeout: 5_000, interval: 50 },
          )
          .toBeGreaterThan(0);
        second = send('post', `${onboarding(actor)}/finish`, {
          actor,
          headers: { 'Idempotency-Key': 'concurrent-second' },
          body,
        });
        await expect
          .poll(
            async () =>
              Number(
                (
                  await query<{ waiting: string }>(
                    'select count(*)::text as waiting from pg_locks where not granted',
                  )
                )[0]?.waiting ?? 0,
              ),
            { timeout: 5_000, interval: 50 },
          )
          .toBeGreaterThan(1);
        await client.query('commit');
      } finally {
        await client.query('rollback');
        client.release();
      }
      const responses = await Promise.all([first, second]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(
        await query<{ count: number }>(
          'select count(*)::int as count from spaces where organization_id = $1 and prefix = $2',
          [organizationId, 'CON'],
        ),
      ).toEqual([{ count: 1 }]);
    }, 30_000);

    it('refuses an in-progress matching key and replays it after the first transaction commits', async () => {
      const actor = sameKeyMember;
      const seed = await send('patch', onboarding(actor), { actor, body: { step: 'preset' } });
      expect(seed.status, seed.text).toBe(200);
      if (db === undefined) throw new Error('Database did not start');
      const client = await db.connect();
      const headers = { 'Idempotency-Key': 'same-onboarding-key' };
      const body = { name: 'Même clé', prefix: 'SKE', preset: 'blank' };
      let pending: Promise<request.Response> | undefined;
      try {
        await client.query('begin');
        await client.query("select set_config('app.system_access', 'on', true)");
        await client.query(
          'select user_id from onboarding_states where organization_id = $1 and user_id = $2 for update',
          [organizationId, actor],
        );
        pending = send('post', `${onboarding(actor)}/finish`, { actor, headers, body });
        await expect
          .poll(
            async () =>
              Number(
                (
                  await query<{ waiting: string }>(
                    'select count(*)::text as waiting from pg_locks where not granted',
                  )
                )[0]?.waiting ?? 0,
              ),
            { timeout: 5_000, interval: 50 },
          )
          .toBeGreaterThan(0);
        const concurrent = await send('post', `${onboarding(actor)}/finish`, {
          actor,
          headers,
          body,
        });
        expect(concurrent.status, concurrent.text).toBe(409);
        expect(concurrent.body).toMatchObject({ code: 'idempotency.request-in-progress' });
        await client.query('commit');
      } finally {
        await client.query('rollback');
        client.release();
      }
      const first = await pending;
      expect(first.status, first.text).toBe(201);
      const replay = await send('post', `${onboarding(actor)}/finish`, { actor, headers, body });
      expect(replay.status, replay.text).toBe(201);
      expect(replay.body).toEqual(first.body);
      expect(replay.headers.location).toBe(first.headers.location);
      const state = FinishOnboardingInternalResponse.parse(first.body as unknown);
      if (state.provisioning === null) throw new Error('Expected a provisioned space');
      expect(
        await query<{ event_name: string; count: number }>(
          `select event_name, count(*)::int as count from outbox_events
         where organization_id = $1 and payload->>'spaceId' = $2
         and event_name in ('space.created.v1', 'list.created.v1', 'task.created.v1')
         group by event_name order by event_name`,
          [organizationId, state.provisioning.spaceId],
        ),
      ).toEqual([
        { event_name: 'list.created.v1', count: 1 },
        { event_name: 'space.created.v1', count: 1 },
      ]);
    }, 30_000);

    it('rolls back a prefix conflict without changing the wizard or creating resources', async () => {
      const before = await send('get', onboarding(member), { actor: member });
      expect(before.status).toBe(200);
      const response = await send('post', `${onboarding(member)}/finish`, {
        actor: member,
        body: { name: 'Conflit', prefix: 'CAD', preset: 'dev' },
      });
      expect(response.status, response.text).toBe(409);
      const after = await send('get', onboarding(member), { actor: member });
      expect(after.status).toBe(200);
      expect(GetOnboardingInternalResponse.parse(after.body as unknown)).toEqual(
        GetOnboardingInternalResponse.parse(before.body as unknown),
      );
      expect(
        await query<{ count: number }>(
          'select count(*)::int as count from spaces where organization_id = $1 and name = $2',
          [organizationId, 'Conflit'],
        ),
      ).toEqual([{ count: 0 }]);
    });

    it('rolls back space, lists, task and outbox when an example task insert fails', async () => {
      const before = await send('get', onboarding(member), { actor: member });
      const beforeState = GetOnboardingInternalResponse.parse(before.body as unknown);
      const counts = (): Promise<
        {
          spaces: number;
          lists: number;
          tasks: number;
          assignments: number;
          events: number;
          prefixes: number;
        }[]
      > =>
        query(
          `select
          (select count(*)::int from spaces where organization_id = $1) as spaces,
          (select count(*)::int from lists where organization_id = $1) as lists,
          (select count(*)::int from tasks where organization_id = $1) as tasks,
          (select count(*)::int from task_assignees where organization_id = $1) as assignments,
          (select count(*)::int from outbox_events where organization_id = $1
            and event_name in ('space.created.v1', 'list.created.v1', 'task.created.v1', 'task.assigned.v1')) as events,
          (select count(*)::int from space_prefixes where organization_id = $1) as prefixes`,
          [organizationId],
        );
      const beforeCounts = await counts();
      await query(`create function onboarding_reject_example() returns trigger language plpgsql as $$
        begin
          if new.name = 'Configurer l’intégration continue' then
            raise exception 'onboarding integration test failure';
          end if;
          return new;
        end;
      $$`);
      await query(`create trigger onboarding_reject_example before insert on tasks
                   for each row execute function onboarding_reject_example()`);
      try {
        const response = await send('post', `${onboarding(member)}/finish`, {
          actor: member,
          body: { name: 'Échec atomique', prefix: 'ERR', preset: 'dev' },
        });
        expect(response.status, response.text).toBe(500);
        const after = await send('get', onboarding(member), { actor: member });
        expect(GetOnboardingInternalResponse.parse(after.body as unknown)).toEqual(beforeState);
        expect(await counts()).toEqual(beforeCounts);
        expect(
          await query<{ count: number }>(
            'select count(*)::int as count from spaces where organization_id = $1 and prefix = $2',
            [organizationId, 'ERR'],
          ),
        ).toEqual([{ count: 0 }]);
        expect(
          await query<{ count: number }>(
            "select count(*)::int as count from outbox_events where organization_id = $1 and payload->>'prefix' = $2",
            [organizationId, 'ERR'],
          ),
        ).toEqual([{ count: 0 }]);
      } finally {
        await query('drop trigger onboarding_reject_example on tasks');
        await query('drop function onboarding_reject_example()');
      }
    });
  });

  describe('the checklist records the first normal task by its owner', () => {
    it('keeps preset examples unmarked and marks a new task only in the provisioned space', async () => {
      const stateResponse = await send('get', onboarding(camille));
      const state = GetOnboardingInternalResponse.parse(stateResponse.body as unknown);
      expect(state.provisioning).not.toBeNull();
      if (state.provisioning === null) throw new Error('Expected a provisioned space');
      expect(state.checklist).toMatchObject({ firstTaskCreated: false, invitationSent: true });
      const listId = state.provisioning.firstListId;
      const marketingResponse = await send('get', onboarding(marketer), { actor: marketer });
      const marketing = GetOnboardingInternalResponse.parse(marketingResponse.body as unknown);
      if (marketing.provisioning === null) throw new Error('Expected the marketing space');
      const grant = await send(
        'put',
        `/internal/v1/lists/${marketing.provisioning.firstListId}/grants/${camille}`,
        {
          actor: marketer,
          body: { role: 'edit' },
        },
      );
      expect(grant.status, grant.text).toBe(200);
      const unrelatedTask = await send(
        'post',
        `/internal/v1/lists/${marketing.provisioning.firstListId}/tasks`,
        {
          body: { name: 'Coordonner la campagne' },
        },
      );
      expect(unrelatedTask.status, unrelatedTask.text).toBe(201);
      const stillUnmarked = await send('get', onboarding(camille));
      expect(
        GetOnboardingInternalResponse.parse(stillUnmarked.body as unknown).checklist
          .firstTaskCreated,
      ).toBe(false);
      const editorGrant = await send('put', `/internal/v1/lists/${listId}/grants/${hugo}`, {
        body: { role: 'edit' },
      });
      expect(editorGrant.status, editorGrant.text).toBe(200);
      const otherCreator = await send('post', `/internal/v1/lists/${listId}/tasks`, {
        actor: hugo,
        body: { name: 'Vérifier la maquette' },
      });
      expect(otherCreator.status, otherCreator.text).toBe(201);
      const ownerStillUnmarked = await send('get', onboarding(camille));
      expect(
        GetOnboardingInternalResponse.parse(ownerStillUnmarked.body as unknown).checklist
          .firstTaskCreated,
      ).toBe(false);
      const creation = await send('post', `/internal/v1/lists/${listId}/tasks`, {
        body: { name: 'Préparer la démo Sprint 14' },
      });
      expect(creation.status, creation.text).toBe(201);
      expect(CreateTaskInternalResponse.parse(creation.body as unknown).name).toBe(
        'Préparer la démo Sprint 14',
      );
      const after = await send('get', onboarding(camille));
      expect(
        GetOnboardingInternalResponse.parse(after.body as unknown).checklist.firstTaskCreated,
      ).toBe(true);
      const other = await send('get', onboarding(hugo), { actor: hugo });
      expect(
        GetOnboardingInternalResponse.parse(other.body as unknown).checklist.firstTaskCreated,
      ).toBe(false);
      const unrelated = await send('get', onboarding(camille), { org: otherOrganization });
      expect(
        GetOnboardingInternalResponse.parse(unrelated.body as unknown).checklist.firstTaskCreated,
      ).toBe(false);
    });
  });
});
