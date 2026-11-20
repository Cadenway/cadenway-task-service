import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  CreateSpaceInternalResponse,
  CreateListInternalResponse,
  CreateSubtaskInternalResponse,
  CreateTaskInternalResponse,
  CreateSpaceCustomFieldInternalResponse,
  GetSpaceCustomFieldInternalResponse,
  UpdateSpaceCustomFieldInternalResponse,
  ListSpaceCustomFieldsInternalResponse,
  ListListCustomFieldsInternalResponse,
  GetTaskInternalResponse,
  ListTasksInternalResponse,
  TrashTaskInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { createApplication, InternalTokenSigner, loadConfig } from '@cadenway/nest-common';
import type { Ed25519PublicJwk } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import { DrizzleCustomFieldRepository } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/custom-field/drizzle-custom-field.repository.js';

const project = `custom-fields-test-${String(process.pid)}`;
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

describe('custom fields with PostgreSQL and NATS', () => {
  let app: NestExpressApplication | undefined;
  let db: pg.Pool | undefined;
  let signer: InternalTokenSigner;
  let listId: string;
  let spaceId: string;

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
    signer = await InternalTokenSigner.create({
      issuer: 'api-gateway',
      privateJwk: { ...publicJwk, d },
    });
    const space = await send('post', '/internal/v1/spaces', {
      body: { name: 'Atelier Nord', prefix: 'CAD', visibility: 'private' },
    });
    expect(space.status, space.text).toBe(201);
    const created = CreateSpaceInternalResponse.parse(space.body as unknown);
    spaceId = created.space.id;
    listId = created.firstList.id;
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

  async function createField(name: string, type: 'number' | 'text'): Promise<string> {
    const result = await send('post', `/internal/v1/spaces/${spaceId}/custom-fields`, {
      body: { name, type },
    });
    expect(result.status, result.text).toBe(201);
    const field = CreateSpaceCustomFieldInternalResponse.parse(result.body as unknown);
    expect(result.headers.location).toBe(
      `/internal/v1/spaces/${spaceId}/custom-fields/${field.id}`,
    );
    expect(result.headers.etag).toBe('"1"');
    return field.id;
  }

  describe('space definitions require management and survive idempotent replay', () => {
    it('returns an in-flight conflict while the first creation waits for the space lock', async () => {
      if (db === undefined) throw new Error('Database did not start');
      const path = `/internal/v1/spaces/${spaceId}/custom-fields`;
      const headers = { 'Idempotency-Key': 'champ-en-cours' };
      const body = { name: 'Suivi de la conception', type: 'text' };
      const client = await db.connect();
      let first: Promise<request.Response> | undefined;
      try {
        await client.query('begin');
        await client.query("select set_config('app.system_access', 'on', true)");
        await client.query(
          'select id from spaces where organization_id = $1 and id = $2 for no key update',
          [organizationId, spaceId],
        );
        first = send('post', path, { body, headers });
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
        const conflict = await send('post', path, { body, headers });
        expect(conflict.status, conflict.text).toBe(409);
        expect((conflict.body as { code: string }).code).toBe('idempotency.request-in-progress');
        await client.query('commit');
      } finally {
        await client.query('rollback');
        client.release();
      }
      const created = await first;
      expect(created.status, created.text).toBe(201);
      const replay = await send('post', path, { body, headers });
      expect(replay.status, replay.text).toBe(201);
      expect(replay.body).toEqual(created.body);
      expect(replay.headers.location).toBe(created.headers.location);
    }, 30_000);

    it('returns a stable creation and checks current visibility before replay', async () => {
      const path = `/internal/v1/spaces/${spaceId}/custom-fields`;
      const headers = { 'Idempotency-Key': 'champs-cad-482' };
      const body = { name: 'Points', type: 'number' };
      const created = await send('post', path, { body, headers });
      expect(created.status, created.text).toBe(201);
      const field = CreateSpaceCustomFieldInternalResponse.parse(created.body as unknown);
      expect(created.headers.location).toBe(`${path}/${field.id}`);
      expect(created.headers.etag).toBe('"1"');
      const replay = await send('post', path, { body, headers });
      expect(replay.status, replay.text).toBe(201);
      expect(replay.body).toEqual(created.body);
      expect(replay.headers.location).toBe(created.headers.location);
      const changed = await send('post', path, { body: { ...body, name: 'Autre' }, headers });
      expect(changed.status, changed.text).toBe(422);
      const unseen = await send('get', path, { actor: hugo });
      expect(unseen.status, unseen.text).toBe(404);
      const grant = await send('put', `/internal/v1/spaces/${spaceId}/grants/${hugo}`, {
        body: { role: 'edit' },
      });
      expect(grant.status, grant.text).toBe(200);
      const refused = await send('post', path, { body, actor: hugo });
      expect(refused.status, refused.text).toBe(403);
      const list = await send('get', path, { actor: hugo });
      expect(list.status, list.text).toBe(200);
      expect(
        ListSpaceCustomFieldsInternalResponse.parse(list.body as unknown).items,
      ).toContainEqual(expect.objectContaining({ id: field.id }));
      expect((await send('delete', `/internal/v1/spaces/${spaceId}/grants/${hugo}`)).status).toBe(
        204,
      );
      expect((await send('get', path, { actor: hugo })).status).toBe(404);
      await query(
        'update organization_members set removed_at = now() where organization_id = $1 and user_id = $2',
        [organizationId, camille],
      );
      try {
        const revoked = await send('post', path, { body, headers });
        expect(revoked.status, revoked.text).toBe(404);
      } finally {
        await query(
          'update organization_members set removed_at = null where organization_id = $1 and user_id = $2',
          [organizationId, camille],
        );
      }
    });

    it('reads a list-only grant without disclosing its space', async () => {
      const grant = await send('put', `/internal/v1/lists/${listId}/grants/${hugo}`, {
        body: { role: 'view' },
      });
      expect(grant.status, grant.text).toBe(200);
      const list = await send('get', `/internal/v1/lists/${listId}/custom-fields`, { actor: hugo });
      expect(list.status, list.text).toBe(200);
      expect(
        ListListCustomFieldsInternalResponse.parse(list.body as unknown).items.length,
      ).toBeGreaterThan(0);
      expect(
        (await send('get', `/internal/v1/spaces/${spaceId}/custom-fields`, { actor: hugo })).status,
      ).toBe(404);
      expect((await send('delete', `/internal/v1/lists/${listId}/grants/${hugo}`)).status).toBe(
        204,
      );
    });
  });

  describe('definition versions and ordering protect sprint points', () => {
    it('rechecks the designated field after waiting for the space lock', async () => {
      const field = await createField('Points du sprint', 'number');
      const key = await task('Réviser la charge du sprint');
      if (db === undefined) throw new Error('Database did not start');
      const client = await db.connect();
      let waiting: Promise<request.Response> | undefined;
      try {
        await client.query('begin');
        await client.query("select set_config('app.system_access', 'on', true)");
        await client.query(
          'select id from spaces where organization_id = $1 and id = $2 for no key update',
          [organizationId, spaceId],
        );
        waiting = send('patch', `/internal/v1/tasks/${key}`, {
          body: { customFieldValues: { [field]: -1 } },
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
          `update space_custom_fields set sprint_points = false
           where organization_id = $1 and space_id = $2 and sprint_points`,
          [organizationId, spaceId],
        );
        await client.query(
          `update space_custom_fields set sprint_points = true
           where organization_id = $1 and id = $2`,
          [organizationId, field],
        );
        await client.query('commit');
      } finally {
        await client.query('rollback');
        client.release();
      }
      const response = await waiting;
      expect(response.status, response.text).toBe(422);
      expect((response.body as { code: string }).code).toBe('custom-field.value-invalid');
      const read = await send('get', `/internal/v1/tasks/${key}`);
      expect(read.status, read.text).toBe(200);
      expect(GetTaskInternalResponse.parse(read.body as unknown).customFieldValues).toEqual({});
    }, 30_000);

    it('enforces 30 active definitions and restores capacity when one retires', async () => {
      const space = await send('post', '/internal/v1/spaces', {
        body: { name: 'Capacité', prefix: 'CAP', visibility: 'private' },
      });
      expect(space.status, space.text).toBe(201);
      const scope = CreateSpaceInternalResponse.parse(space.body as unknown).space.id;
      const path = `/internal/v1/spaces/${scope}/custom-fields`;
      let first = '';
      for (let index = 0; index < 30; index += 1) {
        const response = await send('post', path, {
          body: { name: `Champ ${String(index + 1)}`, type: 'text' },
        });
        expect(response.status, response.text).toBe(201);
        const field = CreateSpaceCustomFieldInternalResponse.parse(response.body as unknown);
        if (index === 0) first = field.id;
      }
      const overflow = await send('post', path, { body: { name: 'Champ 31', type: 'text' } });
      expect(overflow.status, overflow.text).toBe(422);
      expect((overflow.body as { code: string }).code).toBe('custom-field.limit-reached');
      const removed = await send('delete', `${path}/${first}`);
      expect(removed.status, removed.text).toBe(204);
      const replacement = await send('post', path, {
        body: { name: 'Champ remplacé', type: 'number' },
      });
      expect(replacement.status, replacement.text).toBe(201);
    }, 60_000);

    it('retains the prior designation when a negative field cannot become sprint points', async () => {
      const first = await createField('Estimation', 'number');
      const negative = await createField('Charge', 'number');
      const path = `/internal/v1/spaces/${spaceId}/custom-fields`;
      const designation = await send('patch', `${path}/${first}`, {
        body: { sprintPoints: true },
        headers: { 'If-Match': '"1"' },
      });
      expect(designation.status, designation.text).toBe(200);
      const designated = UpdateSpaceCustomFieldInternalResponse.parse(designation.body as unknown);
      expect(designated.sprintPoints).toBe(true);
      const noOp = await send('patch', `${path}/${first}`, { body: { sprintPoints: true } });
      expect(noOp.status, noOp.text).toBe(200);
      expect(UpdateSpaceCustomFieldInternalResponse.parse(noOp.body as unknown).version).toBe(
        designated.version,
      );
      const stale = await send('patch', `${path}/${first}`, {
        body: { name: 'Points de sprint' },
        headers: { 'If-Match': '"1"' },
      });
      expect(stale.status, stale.text).toBe(412);
      const key = await task('Préparer Sprint 14');
      const value = await send('patch', `/internal/v1/tasks/${key}`, {
        body: { customFieldValues: { [negative]: -1 } },
      });
      expect(value.status, value.text).toBe(200);
      const rejected = await send('patch', `${path}/${negative}`, { body: { sprintPoints: true } });
      expect(rejected.status, rejected.text).toBe(422);
      expect((rejected.body as { code: string }).code).toBe('custom-field.sprint-points-invalid');
      const read = await send('get', `${path}/${first}`);
      expect(read.status, read.text).toBe(200);
      expect(GetSpaceCustomFieldInternalResponse.parse(read.body as unknown).sprintPoints).toBe(
        true,
      );
    });
  });

  describe('task custom values are sparse and private to their space', () => {
    it('does not expose destination fields when a task moves after its authorized page was read', async () => {
      const key = await task('Afficher la charge autorisée');
      const destination = await send('post', '/internal/v1/spaces', {
        body: { name: 'Recherche', prefix: 'RCH', visibility: 'private' },
      });
      expect(destination.status, destination.text).toBe(201);
      const otherSpace = CreateSpaceInternalResponse.parse(destination.body as unknown);
      const fieldResponse = await send(
        'post',
        `/internal/v1/spaces/${otherSpace.space.id}/custom-fields`,
        { body: { name: 'Projet secret', type: 'text' } },
      );
      expect(fieldResponse.status, fieldResponse.text).toBe(201);
      const field = CreateSpaceCustomFieldInternalResponse.parse(fieldResponse.body as unknown);
      const application = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      const client = await application.connect();
      try {
        await client.query('begin isolation level read committed');
        await client.query("select set_config('app.organization_id', $1, true)", [organizationId]);
        const page = await client.query<{ id: string; space_id: string; list_id: string }>(
          `select id, space_id, list_id from tasks where organization_id = $1
           and key_prefix = 'CAD' and key_number = $2`,
          [organizationId, Number(key.split('-')[1])],
        );
        const authorized = page.rows[0];
        if (authorized === undefined)
          throw new Error('The task was not found in the original page');
        expect(authorized.space_id).toBe(spaceId);
        const moved = await send('patch', `/internal/v1/tasks/${key}`, {
          body: {
            listId: otherSpace.firstList.id,
            customFieldValues: { [field.id]: 'Données confidentielles' },
          },
        });
        expect(moved.status, moved.text).toBe(200);
        const repository = new DrizzleCustomFieldRepository(drizzle({ client }));
        expect(
          await repository.valuesForTaskPage(organizationId, [
            { taskId: authorized.id, spaceId: authorized.space_id, listId: authorized.list_id },
          ]),
        ).toEqual([]);
        expect(
          await repository.valuesForTaskPage(organizationId, [
            {
              taskId: authorized.id,
              spaceId: otherSpace.space.id,
              listId: otherSpace.firstList.id,
            },
          ]),
        ).toEqual([{ taskId: authorized.id, fieldId: field.id, value: 'Données confidentielles' }]);
        expect(
          await repository.valuesForTaskPage(randomUUID(), [
            {
              taskId: authorized.id,
              spaceId: otherSpace.space.id,
              listId: otherSpace.firstList.id,
            },
          ]),
        ).toEqual([]);
      } finally {
        await client.query('rollback');
        client.release();
        await application.end();
      }
    });

    it('does not expose values when a task moves between lists of the same space after authorization', async () => {
      const field = await createField('Contexte privé', 'text');
      const key = await task('Préparer la réunion client');
      const destination = await send('post', `/internal/v1/spaces/${spaceId}/lists`, {
        body: { name: 'Accès limité' },
      });
      expect(destination.status, destination.text).toBe(201);
      const destinationList = CreateListInternalResponse.parse(destination.body as unknown);
      const grant = await send('put', `/internal/v1/lists/${listId}/grants/${hugo}`, {
        body: { role: 'view' },
      });
      expect(grant.status, grant.text).toBe(200);
      expect((await send('get', `/internal/v1/tasks/${key}`, { actor: hugo })).status).toBe(200);
      const application = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      const client = await application.connect();
      try {
        await client.query('begin isolation level read committed');
        await client.query("select set_config('app.organization_id', $1, true)", [organizationId]);
        const page = await client.query<{ id: string; space_id: string; list_id: string }>(
          `select id, space_id, list_id from tasks where organization_id = $1
           and key_prefix = 'CAD' and key_number = $2`,
          [organizationId, Number(key.split('-')[1])],
        );
        const authorized = page.rows[0];
        if (authorized === undefined)
          throw new Error('The task was not found in the original page');
        const moved = await send('patch', `/internal/v1/tasks/${key}`, {
          body: {
            listId: destinationList.id,
            customFieldValues: { [field]: 'Données confidentielles' },
          },
        });
        expect(moved.status, moved.text).toBe(200);
        expect((await send('get', `/internal/v1/tasks/${key}`, { actor: hugo })).status).toBe(404);
        const repository = new DrizzleCustomFieldRepository(drizzle({ client }));
        expect(
          await repository.valuesForTaskPage(organizationId, [
            { taskId: authorized.id, spaceId: authorized.space_id, listId: authorized.list_id },
          ]),
        ).toEqual([]);
        expect(
          await repository.valuesForTaskPage(organizationId, [
            { taskId: authorized.id, spaceId: authorized.space_id, listId: destinationList.id },
          ]),
        ).toEqual([{ taskId: authorized.id, fieldId: field, value: 'Données confidentielles' }]);
      } finally {
        await client.query('rollback');
        client.release();
        await application.end();
        await send('delete', `/internal/v1/lists/${listId}/grants/${hugo}`);
      }
    });

    it('removes persisted values only when the trashed task is purged', async () => {
      const field = await createField('Référence', 'text');
      const key = await task('Effacer la tâche terminée');
      const saved = await send('patch', `/internal/v1/tasks/${key}`, {
        body: { customFieldValues: { [field]: 'Lumen' } },
      });
      expect(saved.status, saved.text).toBe(200);
      const rows = async (): Promise<readonly unknown[]> =>
        query(
          'select task_id from task_custom_field_values where organization_id = $1 and field_id = $2',
          [organizationId, field],
        );
      expect(await rows()).toHaveLength(1);
      const trashed = await send('post', `/internal/v1/tasks/${key}/trash`, { body: {} });
      expect(trashed.status, trashed.text).toBe(200);
      expect(await rows()).toHaveLength(1);
      const entry = TrashTaskInternalResponse.parse(trashed.body as unknown);
      const purged = await send('delete', `/internal/v1/trash/entries/${entry.id}`);
      expect(purged.status, purged.text).toBe(204);
      expect(await rows()).toHaveLength(0);
    });

    it('clears parent and child values when the subtree moves to another space', async () => {
      const field = await createField('Projet client', 'text');
      const parent = await task('Préparer la démonstration');
      const made = await send('post', `/internal/v1/tasks/${parent}/subtasks`, {
        body: { name: 'Valider les détails' },
      });
      expect(made.status, made.text).toBe(201);
      const child = CreateSubtaskInternalResponse.parse(made.body as unknown).key;
      for (const key of [parent, child]) {
        const response = await send('patch', `/internal/v1/tasks/${key}`, {
          body: { customFieldValues: { [field]: 'Atelier Nord' } },
        });
        expect(response.status, response.text).toBe(200);
      }
      const otherSpace = await send('post', '/internal/v1/spaces', {
        body: { name: 'Produit', prefix: 'PRD', visibility: 'private' },
      });
      expect(otherSpace.status, otherSpace.text).toBe(201);
      const destination = CreateSpaceInternalResponse.parse(otherSpace.body as unknown).firstList
        .id;
      const moved = await send('patch', `/internal/v1/tasks/${parent}`, {
        body: { listId: destination },
      });
      expect(moved.status, moved.text).toBe(200);
      for (const key of [parent, child]) {
        const response = await send('get', `/internal/v1/tasks/${key}`);
        expect(response.status, response.text).toBe(200);
        expect(GetTaskInternalResponse.parse(response.body as unknown).customFieldValues).toEqual(
          {},
        );
      }
      const bulkRoot = await task('Préparer le transfert groupé');
      const bulkValue = await send('patch', `/internal/v1/tasks/${bulkRoot}`, {
        body: { customFieldValues: { [field]: 'Studio Pixel' } },
      });
      expect(bulkValue.status, bulkValue.text).toBe(200);
      const bulkMove = await send('post', '/internal/v1/tasks/bulk-actions', {
        body: { selection: [{ taskKey: bulkRoot }], action: { type: 'move', listId: destination } },
      });
      expect(bulkMove.status, bulkMove.text).toBe(200);
      const bulkRead = await send('get', `/internal/v1/tasks/${bulkRoot}`);
      expect(bulkRead.status, bulkRead.text).toBe(200);
      expect(GetTaskInternalResponse.parse(bulkRead.body as unknown).customFieldValues).toEqual({});
    });

    it('preserves zero and empty text, avoids no-op version changes, and hides retired values', async () => {
      const points = await createField('Points estimés', 'number');
      const text = await createField('Client', 'text');
      const key = await task('Refondre l’écran de connexion SSO');
      const path = `/internal/v1/tasks/${key}`;
      const update = await send('patch', path, {
        body: { customFieldValues: { [points]: 0, [text]: '' } },
      });
      expect(update.status, update.text).toBe(200);
      const saved = GetTaskInternalResponse.parse(update.body as unknown);
      expect(saved.customFieldValues).toEqual({ [points]: 0, [text]: '' });
      const eventsBefore = await query<{ total: number }>(
        `select count(*)::int as total from outbox_events where organization_id = $1
         and event_name = 'task.updated.v1' and payload ->> 'key' = $2`,
        [organizationId, key],
      );
      const noOp = await send('patch', path, {
        body: { customFieldValues: { [points]: 0, [text]: '' } },
      });
      expect(noOp.status, noOp.text).toBe(200);
      expect(GetTaskInternalResponse.parse(noOp.body as unknown).version).toBe(saved.version);
      const eventsAfter = await query<{ total: number }>(
        `select count(*)::int as total from outbox_events where organization_id = $1
         and event_name = 'task.updated.v1' and payload ->> 'key' = $2`,
        [organizationId, key],
      );
      expect(eventsAfter).toEqual(eventsBefore);
      const page = await send('get', `/internal/v1/lists/${listId}/tasks`);
      expect(page.status, page.text).toBe(200);
      expect(ListTasksInternalResponse.parse(page.body as unknown).items).toContainEqual(
        expect.objectContaining({ key, customFieldValues: { [points]: 0, [text]: '' } }),
      );
      const wrong = await send('patch', path, {
        body: { customFieldValues: { [points]: 'mauvais type' } },
      });
      expect(wrong.status, wrong.text).toBe(422);
      const retired = await send('delete', `/internal/v1/spaces/${spaceId}/custom-fields/${text}`);
      expect(retired.status, retired.text).toBe(204);
      expect(
        (await send('get', `/internal/v1/spaces/${spaceId}/custom-fields/${text}`)).status,
      ).toBe(404);
      const after = await send('get', path);
      expect(after.status, after.text).toBe(200);
      expect(GetTaskInternalResponse.parse(after.body as unknown).customFieldValues).toEqual({
        [points]: 0,
      });
      const reset = await send('patch', path, { body: { customFieldValues: { [text]: null } } });
      expect(reset.status, reset.text).toBe(422);
    });
  });
});
