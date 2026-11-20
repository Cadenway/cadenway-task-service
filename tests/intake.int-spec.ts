import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  CreateListInternalResponse,
  CreateSpaceInternalResponse,
  GetIntakeFormConfigurationInternalResponse,
  GetPublicIntakeFormInternalResponse,
  SubmitPublicIntakeFormInternalResponse,
  GetTaskIntakeContactInternalResponse,
  TrashTaskInternalResponse,
  GetTaskInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { createApplication, InternalTokenSigner, loadConfig } from '@cadenway/nest-common';
import type { Ed25519PublicJwk } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import { PURGE_INTAKE_RECEIPTS_QUEUE } from '../src/config/job-queues.js';
import { PurgeIntakeReceiptsHandler } from '../src/modules/intake/presentation/jobs/handlers/form/purge-intake-receipts.handler.js';

const project = `intake-test-${String(process.pid)}`;
const organizationId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const otherOrganization = '01938f6e-0000-7000-8000-000000000002';
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

describe('intake with PostgreSQL and NATS', () => {
  let app: NestExpressApplication | undefined;
  let db: pg.Pool | undefined;
  let signer: InternalTokenSigner;
  let listId: string;
  let publicKey: string;
  let taskId: string;
  let taskKey: string;

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
    options: {
      body?: object;
      headers?: Record<string, string>;
      actor?: string;
      org?: string;
      system?: boolean;
    } = {},
  ): Promise<request.Response> {
    if (app === undefined) throw new Error('Application did not start');
    const token = await signer.sign('task-service', {
      actor:
        options.system === true
          ? { type: 'system', id: null }
          : { type: 'user', id: options.actor ?? camille },
      organizationId:
        options.system === true ? (options.org ?? null) : (options.org ?? organizationId),
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
    for (const [userId, role] of [
      [camille, 'owner'],
      [hugo, 'member'],
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
    const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'intake-test' };
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

  describe('form initialization belongs to a current list editor', () => {
    it('publishes neutral applicant text on a private list without an editor patch', async () => {
      const spaceName = 'Programme confidentiel';
      const listName = 'Dossiers réservés';
      const space = await send('post', '/internal/v1/spaces', {
        body: { name: spaceName, prefix: 'PRI', visibility: 'private' },
      });
      expect(space.status, space.text).toBe(201);
      const { id: spaceId } = CreateSpaceInternalResponse.parse(space.body as unknown).space;
      const list = await send('post', `/internal/v1/spaces/${spaceId}/lists`, {
        body: { name: listName, organizationAccess: false },
      });
      expect(list.status, list.text).toBe(201);
      const { id } = CreateListInternalResponse.parse(list.body as unknown);
      const published = await send('post', `/internal/v1/lists/${id}/intake-form/publish`);
      expect(published.status, published.text).toBe(200);
      const form = GetIntakeFormConfigurationInternalResponse.parse(published.body as unknown);
      if (form.publicKey === null) throw new Error('Publication has no public key');

      const publicForm = await send('get', `/internal/v1/intake-forms/${form.publicKey}`, {
        system: true,
      });
      expect(publicForm.status, publicForm.text).toBe(200);
      expect(GetPublicIntakeFormInternalResponse.parse(publicForm.body as unknown)).toEqual({
        title: 'Déposer une demande',
        description: 'Décrivez votre besoin en quelques mots.',
        fields: form.fields,
      });
      expect(publicForm.text).not.toContain(listName);
      expect(publicForm.text).not.toContain(spaceName);
    });

    it('initializes one identical version under concurrent reads and keeps tenant and actor boundaries', async () => {
      const path = `/internal/v1/lists/${listId}/intake-form`;
      expect((await send('get', path, { actor: hugo })).status).toBe(404);
      expect((await send('get', path, { org: otherOrganization })).status).toBe(404);
      expect((await send('get', path, { system: true })).status).toBe(403);
      const [first, second] = await Promise.all([send('get', path), send('get', path)]);
      expect(first.status, first.text).toBe(200);
      expect(second.status, second.text).toBe(200);
      const draft = GetIntakeFormConfigurationInternalResponse.parse(first.body as unknown);
      expect(draft).toEqual(
        GetIntakeFormConfigurationInternalResponse.parse(second.body as unknown),
      );
      expect(draft).toMatchObject({ version: 1, publicKey: null, defaultAssigneeId: null });
      expect(first.headers.etag).toBe('"1"');
      expect(second.headers.etag).toBe('"1"');
      expect(
        await query<{ total: number }>(
          'select count(*)::int as total from intake_forms where organization_id = $1 and list_id = $2',
          [organizationId, listId],
        ),
      ).toEqual([{ total: 1 }]);
      expect((await send('patch', path, { body: { title: 'Demandes Sprint 14' } })).status).toBe(
        400,
      );
      const changed = await send('patch', path, {
        headers: { 'If-Match': '"1"' },
        body: { title: 'Demandes Sprint 14' },
      });
      expect(changed.status, changed.text).toBe(200);
      expect(
        GetIntakeFormConfigurationInternalResponse.parse(changed.body as unknown),
      ).toMatchObject({ version: 2, title: 'Demandes Sprint 14' });
      expect(
        (await send('patch', path, { headers: { 'If-Match': '"1"' }, body: { title: 'Obsolète' } }))
          .status,
      ).toBe(412);
      const published = await send('post', `${path}/publish`);
      expect(published.status, published.text).toBe(200);
      const form = GetIntakeFormConfigurationInternalResponse.parse(published.body as unknown);
      if (form.publicKey === null) throw new Error('Publication has no public key');
      publicKey = form.publicKey;
      const repeated = await send('post', `${path}/publish`);
      expect(GetIntakeFormConfigurationInternalResponse.parse(repeated.body as unknown)).toEqual(
        form,
      );
      expect(repeated.headers.etag).toBe(published.headers.etag);
    });
  });

  describe('the published link accepts only an unscoped system caller', () => {
    it('creates a task, private contact, ordinary outbox fact and a scoped receipt', async () => {
      const path = `/internal/v1/intake-forms/${publicKey}`;
      expect((await send('get', path)).status).toBe(403);
      expect((await send('get', path, { system: true, org: organizationId })).status).toBe(403);
      const publicForm = await send('get', path, { system: true });
      expect(publicForm.status, publicForm.text).toBe(200);
      expect(GetPublicIntakeFormInternalResponse.parse(publicForm.body as unknown)).toMatchObject({
        title: 'Demandes Sprint 14',
      });
      expect(Object.keys(publicForm.body as object).sort()).toEqual([
        'description',
        'fields',
        'title',
      ]);
      const submission = {
        title: 'Refondre l’écran de connexion SSO',
        description: 'Clarifier la connexion.',
        contactEmail: 'demandeur@example.test',
      };
      const headers = { 'Idempotency-Key': 'intake-cad-482' };
      const first = await send('post', `${path}/submissions`, {
        system: true,
        headers,
        body: submission,
      });
      expect(first.status, first.text).toBe(200);
      const receipt = SubmitPublicIntakeFormInternalResponse.parse(first.body as unknown);
      const replay = await send('post', `${path}/submissions`, {
        system: true,
        headers,
        body: submission,
      });
      expect(replay.status, replay.text).toBe(200);
      expect(SubmitPublicIntakeFormInternalResponse.parse(replay.body as unknown)).toEqual(receipt);
      const changed = await send('post', `${path}/submissions`, {
        system: true,
        headers,
        body: { ...submission, title: 'Autre demande' },
      });
      expect(changed.status, changed.text).toBe(422);
      const rows = await query<{
        id: string;
        key_prefix: string;
        key_number: number;
        status: string;
        created_by_type: string;
      }>(
        'select id, key_prefix, key_number, status, created_by_type from tasks where organization_id = $1 and list_id = $2 and name = $3',
        [organizationId, listId, submission.title],
      );
      expect(rows).toHaveLength(1);
      const row = rows[0];
      if (row === undefined) throw new Error('Intake task missing');
      taskId = row.id;
      taskKey = `${row.key_prefix}-${String(row.key_number)}`;
      expect(row).toMatchObject({ status: 'triage', created_by_type: 'system' });
      const contact = await send('get', `/internal/v1/tasks/${taskKey}/intake-contact`);
      expect(contact.status, contact.text).toBe(200);
      expect(GetTaskIntakeContactInternalResponse.parse(contact.body as unknown)).toEqual({
        contactEmail: submission.contactEmail,
      });
      expect(
        (await send('get', `/internal/v1/tasks/${taskKey}/intake-contact`, { actor: hugo })).status,
      ).toBe(404);
      const task = await send('get', `/internal/v1/tasks/${taskKey}`);
      expect(task.status, task.text).toBe(200);
      const taskView = GetTaskInternalResponse.parse(task.body as unknown);
      expect(JSON.stringify(taskView)).not.toContain(submission.contactEmail);
      expect(
        await query<{ email: string }>(
          'select email from intake_contacts where organization_id = $1 and task_id = $2',
          [organizationId, taskId],
        ),
      ).toEqual([{ email: submission.contactEmail }]);
      const events = await query<{ payload: unknown }>(
        `select payload from outbox_events where organization_id = $1 and event_name = 'task.created.v1' and payload->>'key' = $2`,
        [organizationId, taskKey],
      );
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events)).not.toContain(submission.contactEmail);
      expect(events[0]?.payload).toMatchObject({ actor: { type: 'system' } });
    });

    it('returns in-progress for a held publication-scoped key without writing a task', async () => {
      if (db === undefined) throw new Error('Database did not start');
      const client = await db.connect();
      const key = 'intake-in-progress';
      const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `intake:${organizationId}:${digest(publicKey)}:${digest(key)}`,
        ]);
        const blocked = await send('post', `/internal/v1/intake-forms/${publicKey}/submissions`, {
          system: true,
          headers: { 'Idempotency-Key': key },
          body: { title: 'En attente', contactEmail: 'attente@example.test' },
        });
        expect(blocked.status, blocked.text).toBe(409);
        expect(blocked.body as unknown).toMatchObject({ code: 'idempotency.request-in-progress' });
        expect(
          await query<{ total: number }>(
            'select count(*)::int as total from tasks where organization_id = $1 and name = $2',
            [organizationId, 'En attente'],
          ),
        ).toEqual([{ total: 0 }]);
      } finally {
        await client.query('rollback');
        client.release();
      }
    });

    it('physically purges expired receipts without disturbing active receipts or key reservations', async () => {
      if (app === undefined) throw new Error('Application did not start');
      const path = `/internal/v1/intake-forms/${publicKey}/submissions`;
      const key = 'intake-receipt-retention';
      const digest = createHash('sha256').update(key).digest('hex');
      const activeDigest = createHash('sha256').update('intake-cad-482').digest('hex');
      const options = {
        system: true,
        headers: { 'Idempotency-Key': key },
        body: {
          title: 'Demande avec durée de conservation',
          contactEmail: 'retention@example.test',
        },
      };
      const first = await send('post', path, options);
      expect(first.status, first.text).toBe(200);
      const original = SubmitPublicIntakeFormInternalResponse.parse(first.body as unknown);
      expect(
        await query(
          `update intake_submissions set created_at = now() - interval '25 hours'
           where organization_id = $1 and key_digest = $2 returning key_digest`,
          [organizationId, digest],
        ),
      ).toEqual([{ key_digest: digest }]);

      const handler = app.get(PurgeIntakeReceiptsHandler, { strict: false });
      await handler.handle({
        id: randomUUID(),
        queue: PURGE_INTAKE_RECEIPTS_QUEUE,
        payload: null,
        organizationId: null,
        attempt: 1,
        signal: new AbortController().signal,
      });

      expect(
        await query(
          `select key_digest from intake_submissions
           where organization_id = $1 and key_digest in ($2, $3) order by key_digest`,
          [organizationId, activeDigest, digest],
        ),
      ).toEqual([{ key_digest: activeDigest }]);
      expect(
        await query(
          `select key_digest from intake_publications where organization_id = $1 and key_digest = $2`,
          [organizationId, createHash('sha256').update(publicKey).digest('hex')],
        ),
      ).toHaveLength(1);
      const second = await send('post', path, options);
      expect(second.status, second.text).toBe(200);
      const renewed = SubmitPublicIntakeFormInternalResponse.parse(second.body as unknown);
      expect(renewed).not.toEqual(original);
      expect(
        SubmitPublicIntakeFormInternalResponse.parse(
          (await send('post', path, options)).body as unknown,
        ),
      ).toEqual(renewed);
    });
  });

  describe('the form follows its list lifecycle and the contact follows its task', () => {
    it('suspends a published form on archive, retains draft settings and resumes on restore', async () => {
      const formPath = `/internal/v1/lists/${listId}/intake-form`;
      const publicPath = `/internal/v1/intake-forms/${publicKey}`;
      const body = {
        title: 'Refondre l’écran de connexion SSO',
        description: 'Clarifier la connexion.',
        contactEmail: 'demandeur@example.test',
      };
      expect(
        (await send('post', `/internal/v1/lists/${listId}/archive`, { body: {} })).status,
      ).toBe(200);
      expect((await send('get', formPath)).status).toBe(200);
      expect((await send('get', publicPath, { system: true })).status).toBe(404);
      expect(
        (
          await send('post', `${publicPath}/submissions`, {
            system: true,
            headers: { 'Idempotency-Key': 'intake-cad-482' },
            body,
          })
        ).status,
      ).toBe(404);
      expect(
        (await send('post', `/internal/v1/lists/${listId}/unarchive`, { body: {} })).status,
      ).toBe(200);
      expect((await send('get', publicPath, { system: true })).status).toBe(200);
      expect(
        (
          await send('post', `${publicPath}/submissions`, {
            system: true,
            headers: { 'Idempotency-Key': 'intake-cad-482' },
            body,
          })
        ).status,
      ).toBe(200);
      expect((await send('delete', `${formPath}/publication`)).status).toBe(204);
      expect((await send('get', publicPath, { system: true })).status).toBe(404);
      expect(
        (
          await send('post', `${publicPath}/submissions`, {
            system: true,
            headers: { 'Idempotency-Key': 'intake-cad-482' },
            body,
          })
        ).status,
      ).toBe(404);
      const draft = await send('get', formPath);
      expect(GetIntakeFormConfigurationInternalResponse.parse(draft.body as unknown)).toMatchObject(
        { title: 'Demandes Sprint 14', publicKey: null },
      );
      const republished = await send('post', `${formPath}/publish`);
      const replacement = GetIntakeFormConfigurationInternalResponse.parse(
        republished.body as unknown,
      );
      expect(replacement.publicKey).not.toBeNull();
      expect(replacement.publicKey).not.toBe(publicKey);
      expect((await send('get', publicPath, { system: true })).status).toBe(404);
    });

    it('removes the separate contact when its task is physically purged', async () => {
      const trashed = await send('post', `/internal/v1/tasks/${taskKey}/trash`, { body: {} });
      expect(trashed.status, trashed.text).toBe(200);
      const entry = TrashTaskInternalResponse.parse(trashed.body as unknown);
      expect(
        await query(
          'select task_id from intake_contacts where organization_id = $1 and task_id = $2',
          [organizationId, taskId],
        ),
      ).toHaveLength(1);
      expect((await send('delete', `/internal/v1/trash/entries/${entry.id}`)).status).toBe(204);
      expect(
        await query(
          'select task_id from intake_contacts where organization_id = $1 and task_id = $2',
          [organizationId, taskId],
        ),
      ).toHaveLength(0);
    });

    it('permanently revokes the publication after logical list deletion and task restoration', async () => {
      const space = await send('post', '/internal/v1/spaces', {
        body: { name: 'Demandes clients', prefix: 'REQ', visibility: 'private' },
      });
      expect(space.status, space.text).toBe(201);
      const id = CreateSpaceInternalResponse.parse(space.body as unknown).firstList.id;
      const formPath = `/internal/v1/lists/${id}/intake-form`;
      expect((await send('get', formPath)).status).toBe(200);
      const publication = await send('post', `${formPath}/publish`);
      expect(publication.status, publication.text).toBe(200);
      const form = GetIntakeFormConfigurationInternalResponse.parse(publication.body as unknown);
      if (form.publicKey === null) throw new Error('Publication has no key');
      const publicPath = `/internal/v1/intake-forms/${form.publicKey}`;
      const submitted = await send('post', `${publicPath}/submissions`, {
        system: true,
        body: { title: 'Demande à restaurer', contactEmail: 'restaurer@example.test' },
      });
      expect(submitted.status, submitted.text).toBe(200);
      expect((await send('delete', `/internal/v1/lists/${id}`)).status).toBe(204);
      expect((await send('get', publicPath, { system: true })).status).toBe(404);
      await expect
        .poll(
          async () =>
            (
              await query<{ id: string }>(
                'select id from trash_entries where organization_id = $1 and list_id = $2',
                [organizationId, id],
              )
            ).length,
          { timeout: 30_000, interval: 200 },
        )
        .toBe(1);
      const entries = await query<{ id: string }>(
        'select id from trash_entries where organization_id = $1 and list_id = $2',
        [organizationId, id],
      );
      const entry = entries[0];
      if (entry === undefined) throw new Error('Deleted list task was not trashed');
      const restored = await send('post', `/internal/v1/trash/entries/${entry.id}/restore`, {
        body: {},
      });
      expect(restored.status, restored.text).toBe(200);
      expect((await send('get', publicPath, { system: true })).status).toBe(404);
      const restoredDraft = await send('get', formPath);
      expect(restoredDraft.status, restoredDraft.text).toBe(200);
      expect(
        GetIntakeFormConfigurationInternalResponse.parse(restoredDraft.body as unknown).publicKey,
      ).toBeNull();
    }, 60_000);
  });
});
