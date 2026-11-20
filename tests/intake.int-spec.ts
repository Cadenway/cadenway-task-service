import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import type { IntakeAttachmentVerifiedV1 } from '@cadenway/contracts/events/storage-service';
import {
  CreateListInternalResponse,
  AllocateIntakeAttachmentInternalResponse,
  CreateSpaceInternalResponse,
  GetIntakeFormConfigurationInternalResponse,
  GetPublicIntakeFormInternalResponse,
  SubmitPublicIntakeFormInternalResponse,
  GetTaskIntakeContactInternalResponse,
  ResolveIntakeAttachmentInternalResponse,
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
import {
  EXPIRE_INTAKE_ATTACHMENT_DRAFTS_QUEUE,
  PURGE_INTAKE_RECEIPTS_QUEUE,
} from '../src/config/job-queues.js';
import { ExpireIntakeAttachmentDraftsHandler } from '../src/modules/intake/presentation/jobs/handlers/attachment/expire-intake-attachment-drafts.handler.js';
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

  describe('anonymous attachment drafts', () => {
    const draftKey = 'a'.repeat(43);
    const otherDraftKey = 'b'.repeat(43);
    const allocationBody = {
      fileName: 'capture-sso.png',
      contentType: 'image/png',
      sizeBytes: 184320,
    };

    async function allocate(key: string, index: number): Promise<request.Response> {
      return send('post', `/internal/v1/intake-forms/${publicKey}/attachments`, {
        system: true,
        headers: { 'Intake-Draft-Key': key, 'Idempotency-Key': `attachment-${String(index)}` },
        body: allocationBody,
      });
    }

    async function publishStorageVerification(fact: IntakeAttachmentVerifiedV1): Promise<void> {
      const consumerInfo = (): {
        delivered: { consumer_seq: number };
        ack_floor: { consumer_seq: number };
      } =>
        JSON.parse(
          compose(
            'exec',
            '-T',
            'nats-streams',
            'nats',
            'consumer',
            'info',
            'EVENTS',
            'task-service__verify-intake-attachment',
            '--json',
          ),
        ) as {
          delivered: { consumer_seq: number };
          ack_floor: { consumer_seq: number };
        };
      const sequenceBefore = consumerInfo().delivered.consumer_seq;
      compose(
        'exec',
        '-T',
        'nats-streams',
        'nats',
        'pub',
        '--jetstream',
        '--header',
        `Nats-Msg-Id:${randomUUID()}`,
        'evt.intake.attachment-verified.v1',
        JSON.stringify(fact),
      );
      await vi.waitFor(
        () => {
          const info = consumerInfo();
          expect(info.delivered.consumer_seq).toBeGreaterThan(sequenceBefore);
          expect(info.ack_floor.consumer_seq).toBe(info.delivered.consumer_seq);
        },
        { timeout: 15_000 },
      );
    }

    it('binds five replayable reservations to the draft and rejects other draft keys', async () => {
      const first = await allocate(draftKey, 1);
      expect(first.status, first.text).toBe(201);
      expect(first.headers['cache-control']).toBe('no-store');
      const reservation = AllocateIntakeAttachmentInternalResponse.parse(first.body as unknown);
      const replay = await allocate(draftKey, 1);
      expect(replay.status, replay.text).toBe(201);
      expect(AllocateIntakeAttachmentInternalResponse.parse(replay.body as unknown)).toEqual(
        reservation,
      );
      const changed = await send('post', `/internal/v1/intake-forms/${publicKey}/attachments`, {
        system: true,
        headers: { 'Intake-Draft-Key': draftKey, 'Idempotency-Key': 'attachment-1' },
        body: { ...allocationBody, fileName: 'autre-capture.png' },
      });
      expect(changed.status, changed.text).toBe(422);
      expect(changed.body).toMatchObject({ code: 'idempotency.key-reused' });
      const proof = await send(
        'get',
        `/internal/v1/intake-forms/${publicKey}/attachments/${reservation.attachmentId}`,
        { system: true, headers: { 'Intake-Draft-Key': draftKey, 'If-None-Match': '*' } },
      );
      expect(proof.status, proof.text).toBe(200);
      expect(proof.headers['cache-control']).toBe('no-store');
      expect(ResolveIntakeAttachmentInternalResponse.parse(proof.body as unknown)).toEqual(
        reservation,
      );
      const otherDraft = await send(
        'get',
        `/internal/v1/intake-forms/${publicKey}/attachments/${reservation.attachmentId}`,
        { system: true, headers: { 'Intake-Draft-Key': otherDraftKey } },
      );
      expect(otherDraft.status, otherDraft.text).toBe(404);
      for (let index = 2; index <= 5; index += 1) {
        const allocated = await allocate(draftKey, index);
        expect(allocated.status, allocated.text).toBe(201);
      }
      const overflow = await allocate(draftKey, 6);
      expect(overflow.status, overflow.text).toBe(422);
      const digest = createHash('sha256').update(draftKey).digest('hex');
      expect(
        await query<{ total: number }>(
          `select count(*)::int as total from intake_attachment_reservations
           where organization_id = $1 and draft_digest = $2 and status = 'reserved'`,
          [organizationId, digest],
        ),
      ).toEqual([{ total: 5 }]);
    });

    it('serializes six simultaneous reservations and admits only five', async () => {
      const concurrentKey = 'd'.repeat(43);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) => allocate(concurrentKey, index + 20)),
      );
      expect(results.map((result) => result.status).sort()).toEqual([201, 201, 201, 201, 201, 422]);
      expect(
        await query<{ total: number }>(
          `select count(*)::int as total from intake_attachment_reservations
           where organization_id = $1 and draft_digest = $2 and status = 'reserved'`,
          [organizationId, createHash('sha256').update(concurrentKey).digest('hex')],
        ),
      ).toEqual([{ total: 5 }]);
    });

    it('keeps the same draft credential separate between organizations and publications', async () => {
      const space = await send('post', '/internal/v1/spaces', {
        org: otherOrganization,
        body: { name: 'Autre atelier', prefix: 'AUT', visibility: 'private' },
      });
      expect(space.status, space.text).toBe(201);
      const otherList = CreateSpaceInternalResponse.parse(space.body as unknown).firstList.id;
      const published = await send('post', `/internal/v1/lists/${otherList}/intake-form/publish`, {
        org: otherOrganization,
      });
      expect(published.status, published.text).toBe(200);
      const otherKey = GetIntakeFormConfigurationInternalResponse.parse(
        published.body as unknown,
      ).publicKey;
      if (otherKey === null) throw new Error('Other publication has no key');
      const allocated = await send('post', `/internal/v1/intake-forms/${otherKey}/attachments`, {
        system: true,
        headers: { 'Intake-Draft-Key': draftKey, 'Idempotency-Key': 'attachment-1' },
        body: allocationBody,
      });
      expect(allocated.status, allocated.text).toBe(201);
      const other = AllocateIntakeAttachmentInternalResponse.parse(allocated.body as unknown);
      expect(other.organizationId).toBe(otherOrganization);
      expect(
        (
          await send(
            'get',
            `/internal/v1/intake-forms/${publicKey}/attachments/${other.attachmentId}`,
            { system: true, headers: { 'Intake-Draft-Key': draftKey } },
          )
        ).status,
      ).toBe(404);
      const draftDigest = createHash('sha256').update(draftKey).digest('hex');
      expect(
        await query<{ organization_id: string; total: number }>(
          `select organization_id, count(*)::int as total from intake_attachment_reservations
           where draft_digest = $1 group by organization_id order by organization_id`,
          [draftDigest],
        ),
      ).toEqual([
        { organization_id: otherOrganization, total: 1 },
        { organization_id: organizationId, total: 5 },
      ]);
    });

    it('applies a Storage verification once and atomically claims only the selected file', async () => {
      const rows = await query<{ attachment_id: string; publication_id: string }>(
        `select attachment_id, publication_id from intake_attachment_reservations
         where organization_id = $1 and draft_digest = $2 order by attachment_id`,
        [organizationId, createHash('sha256').update(draftKey).digest('hex')],
      );
      const selected = rows[0];
      if (selected === undefined) throw new Error('Missing attachment reservation');
      const fact: IntakeAttachmentVerifiedV1 = {
        id: randomUUID(),
        occurredAt: new Date().toISOString(),
        organizationId: organizationId.toUpperCase(),
        actor: { type: 'system', id: 'storage-service' },
        version: 1,
        publicationId: selected.publication_id.toUpperCase(),
        attachmentId: selected.attachment_id.toUpperCase(),
      };
      for (let delivery = 0; delivery < 2; delivery += 1) {
        await publishStorageVerification(fact);
        expect(
          await query<{ status: string }>(
            'select status from intake_attachment_reservations where organization_id = $1 and attachment_id = $2',
            [organizationId, selected.attachment_id],
          ),
        ).toEqual([{ status: 'verified' }]);
      }
      const path = `/internal/v1/intake-forms/${publicKey}/submissions`;
      const submission = {
        title: 'Joindre la capture SSO',
        contactEmail: 'capture@example.test',
        attachmentIds: [selected.attachment_id],
      };
      const options = {
        system: true,
        headers: { 'Idempotency-Key': 'intake-with-attachment', 'Intake-Draft-Key': draftKey },
        body: submission,
      };
      const submitted = await send('post', path, options);
      expect(submitted.status, submitted.text).toBe(200);
      const receipt = SubmitPublicIntakeFormInternalResponse.parse(submitted.body as unknown);
      const replay = await send('post', path, options);
      expect(replay.status, replay.text).toBe(200);
      expect(SubmitPublicIntakeFormInternalResponse.parse(replay.body as unknown)).toEqual(receipt);
      const task = await query<{ id: string; task_key: string }>(
        `select id, key_prefix || '-' || key_number::text as task_key from tasks
         where organization_id = $1 and name = $2`,
        [organizationId, submission.title],
      );
      expect(task).toHaveLength(1);
      expect(
        await query(
          'select email from intake_contacts where organization_id = $1 and task_id = $2',
          [organizationId, task[0]?.id],
        ),
      ).toEqual([{ email: submission.contactEmail }]);
      const decisions = await query<{ status: string; total: number }>(
        `select status, count(*)::int as total from intake_attachment_reservations
         where organization_id = $1 and draft_digest = $2 group by status order by status`,
        [organizationId, createHash('sha256').update(draftKey).digest('hex')],
      );
      expect(decisions).toEqual([
        { status: 'claimed', total: 1 },
        { status: 'released', total: 4 },
      ]);
      const facts = await query<{ event_name: string; total: number }>(
        `select event_name, count(*)::int as total from outbox_events
         where organization_id = $1 and event_name in
         ('intake.attachment-claimed.v1', 'intake.attachment-released.v1')
         and payload->>'attachmentId' = any($2::text[])
         group by event_name order by event_name`,
        [organizationId, rows.map((row) => row.attachment_id)],
      );
      expect(facts).toEqual([
        { event_name: 'intake.attachment-claimed.v1', total: 1 },
        { event_name: 'intake.attachment-released.v1', total: 4 },
      ]);
      expect(
        await query<{ total: number }>(
          'select count(*)::int as total from processed_events where event_id = $1 and consumer = $2',
          [fact.id, 'task-service__verify-intake-attachment'],
        ),
      ).toEqual([{ total: 1 }]);
    });

    it('rolls back the task, contact, receipt and claim if the outbox insert fails', async () => {
      const rollbackKey = 'c'.repeat(43);
      const allocated = await allocate(rollbackKey, 8);
      expect(allocated.status, allocated.text).toBe(201);
      const { attachmentId } = AllocateIntakeAttachmentInternalResponse.parse(
        allocated.body as unknown,
      );
      await query(
        `update intake_attachment_reservations set status = 'verified'
         where organization_id = $1 and attachment_id = $2`,
        [organizationId, attachmentId],
      );
      await query(`create function test_fail_intake_outbox() returns trigger language plpgsql as $$
        begin
          if new.event_name = 'intake.attachment-claimed.v1' then
            raise exception 'test failure while recording attachment claim';
          end if;
          return new;
        end
        $$`);
      await query(
        `create trigger test_fail_intake_outbox before insert on outbox_events
         for each row execute function test_fail_intake_outbox()`,
      );
      const title = 'Demande avec reprise après échec';
      const options = {
        system: true,
        headers: { 'Idempotency-Key': 'intake-rollback', 'Intake-Draft-Key': rollbackKey },
        body: {
          title,
          contactEmail: 'reprise@example.test',
          attachmentIds: [attachmentId],
        },
      };
      try {
        const rejected = await send(
          'post',
          `/internal/v1/intake-forms/${publicKey}/submissions`,
          options,
        );
        expect(rejected.status, rejected.text).toBe(500);
        expect(
          await query<{ total: number }>(
            'select count(*)::int as total from tasks where organization_id = $1 and name = $2',
            [organizationId, title],
          ),
        ).toEqual([{ total: 0 }]);
        expect(
          await query<{ total: number }>(
            'select count(*)::int as total from intake_contacts where organization_id = $1 and email = $2',
            [organizationId, options.body.contactEmail],
          ),
        ).toEqual([{ total: 0 }]);
        expect(
          await query(
            'select status from intake_attachment_reservations where organization_id = $1 and attachment_id = $2',
            [organizationId, attachmentId],
          ),
        ).toEqual([{ status: 'verified' }]);
        expect(
          await query<{ total: number }>(
            'select count(*)::int as total from intake_submissions where organization_id = $1 and key_digest = $2',
            [organizationId, createHash('sha256').update('intake-rollback').digest('hex')],
          ),
        ).toEqual([{ total: 0 }]);
      } finally {
        await query('drop trigger test_fail_intake_outbox on outbox_events');
        await query('drop function test_fail_intake_outbox()');
      }
      const retried = await send(
        'post',
        `/internal/v1/intake-forms/${publicKey}/submissions`,
        options,
      );
      expect(retried.status, retried.text).toBe(200);
      SubmitPublicIntakeFormInternalResponse.parse(retried.body as unknown);
    });

    it('releases an expired draft once and prunes only reservations beyond retention', async () => {
      if (app === undefined) throw new Error('Application did not start');
      const allocated = await allocate(otherDraftKey, 7);
      expect(allocated.status, allocated.text).toBe(201);
      const { attachmentId, publicationId } = AllocateIntakeAttachmentInternalResponse.parse(
        allocated.body as unknown,
      );
      const recent = await allocate(otherDraftKey, 9);
      expect(recent.status, recent.text).toBe(201);
      const { attachmentId: recentId } = AllocateIntakeAttachmentInternalResponse.parse(
        recent.body as unknown,
      );
      await query(
        `update intake_attachment_drafts set expires_at = now() - interval '1 minute'
         where organization_id = $1 and draft_digest = $2`,
        [organizationId, createHash('sha256').update(otherDraftKey).digest('hex')],
      );
      const handler = app.get(ExpireIntakeAttachmentDraftsHandler, { strict: false });
      const sweep = (): Promise<void> =>
        handler.handle({
          id: randomUUID(),
          queue: EXPIRE_INTAKE_ATTACHMENT_DRAFTS_QUEUE,
          payload: null,
          organizationId: null,
          attempt: 1,
          signal: new AbortController().signal,
        });
      await sweep();
      await sweep();
      const initial = await query<{
        attachment_id: string;
        status: string;
        declaration_digest: string;
      }>(
        `select attachment_id, status, declaration_digest from intake_attachment_reservations
         where organization_id = $1 and attachment_id in ($2, $3) order by attachment_id`,
        [organizationId, attachmentId, recentId],
      );
      expect(initial).toMatchObject(
        [attachmentId, recentId].sort().map((id) => ({ attachment_id: id, status: 'released' })),
      );
      for (const row of initial) expect(row.declaration_digest).toMatch(/^[0-9a-f]{64}$/u);
      expect(
        await query(
          `update intake_attachment_reservations set updated_at = now() - interval '25 hours'
           where organization_id = $1 and attachment_id = $2 returning attachment_id`,
          [organizationId, attachmentId],
        ),
      ).toEqual([{ attachment_id: attachmentId }]);
      await sweep();
      const lateFactId = randomUUID();
      await publishStorageVerification({
        id: lateFactId,
        occurredAt: new Date().toISOString(),
        organizationId,
        actor: { type: 'system', id: 'storage-service' },
        version: 1,
        publicationId,
        attachmentId,
      });
      expect(
        await query('select event_id from processed_events where event_id = $1 and consumer = $2', [
          lateFactId,
          'task-service__verify-intake-attachment',
        ]),
      ).toEqual([{ event_id: lateFactId }]);
      expect(
        await query(
          `select attachment_id, status from intake_attachment_reservations
           where organization_id = $1 and attachment_id in ($2, $3)`,
          [organizationId, attachmentId, recentId],
        ),
      ).toEqual([{ attachment_id: recentId, status: 'released' }]);
      const reopened = await allocate(otherDraftKey, 7);
      expect(reopened.status, reopened.text).toBe(404);
      expect(reopened.body).toMatchObject({ code: 'intake-form.not-found' });
      expect(
        await query(
          `select event_name, count(*)::int as total from outbox_events
           where organization_id = $1 and payload->>'attachmentId' = $2
           group by event_name`,
          [organizationId, attachmentId],
        ),
      ).toEqual([{ event_name: 'intake.attachment-released.v1', total: 1 }]);
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
