import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { listSavedViewChangedV1Schema } from '@cadenway/contracts/events/task-service';
import {
  CreateSavedViewInternalResponse,
  CreateSpaceInternalResponse,
  DuplicateSavedViewInternalResponse,
  GetSavedViewInternalResponse,
  ListSavedViewsInternalResponse,
  UpdateSavedViewInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { createApplication, InternalTokenSigner, loadConfig } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';

const composeFile = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));
const project = `cadenway-task-service-views-${String(process.pid)}`;
const organizationId = randomUUID();
const otherOrganization = randomUUID();
const ownerId = randomUUID();
const commenterId = randomUUID();
const configuration = {
  layout: 'table',
  filters: { assignee: ['me', 'none'], label: ['Plateforme'], status: ['review'] },
  sort: '-dueDate',
  groupBy: 'status',
  presentation: { hiddenSheetColumns: ['labels'], sheetSort: { column: 'name', direction: 'asc' } },
};

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

function hostPort(service: string, port: string): string {
  const address = compose('port', service, port).trim();
  const mapped = /:(\d+)$/u.exec(address)?.[1];
  if (mapped === undefined) throw new Error(`No host port for ${service}:${port}.`);
  return mapped;
}

function expectProblem(response: request.Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(response.headers['content-type']).toMatch(/^application\/problem\+json/u);
  expect(response.body as unknown).toMatchObject({ status, code });
}

describe('shared saved-view routes and PostgreSQL storage', () => {
  let app: NestExpressApplication | undefined;
  let migrator: pg.Pool | undefined;
  let signer: InternalTokenSigner;

  async function asSystem<Row extends pg.QueryResultRow>(
    statement: string,
    parameters: unknown[],
  ): Promise<Row[]> {
    if (migrator === undefined) throw new Error('The disposable database is unavailable.');
    const client = await migrator.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.system_access', 'on', true)");
      const query = await client.query<Row>(statement, parameters);
      await client.query('commit');
      return query.rows;
    } catch (error: unknown) {
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
      actorId?: string;
      organization?: string;
      body?: object;
      chunk?: string;
      headers?: Readonly<Record<string, string>>;
    } = {},
  ): Promise<request.Response> {
    if (app === undefined) throw new Error('The test application is unavailable.');
    const token = await signer.sign('task-service', {
      actor: { type: 'user', id: options.actorId ?? ownerId },
      organizationId: options.organization ?? organizationId,
    });
    let call = request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`);
    for (const [name, value] of Object.entries(options.headers ?? {})) call = call.set(name, value);
    if (options.chunk !== undefined) call.write(options.chunk);
    return options.body === undefined ? call : call.send(options.body);
  }

  async function createList(
    name: string,
    prefix: string,
  ): Promise<{ spaceId: string; listId: string; path: string }> {
    const response = await send('post', '/internal/v1/spaces', { body: { name, prefix } });
    expect(response.status, response.text).toBe(201);
    const created = CreateSpaceInternalResponse.parse(response.body);
    return {
      spaceId: created.space.id,
      listId: created.firstList.id,
      path: `/internal/v1/lists/${created.firstList.id}/saved-views`,
    };
  }

  async function createView(path: string, name: string) {
    const response = await send('post', path, { body: { name, icon: 'bug', configuration } });
    expect(response.status, response.text).toBe(201);
    const body = CreateSavedViewInternalResponse.parse(response.body);
    expect(response.headers.location).toBe(`${path}/${body.id}`);
    expect(response.headers.etag).toBe('"1"');
    expect(body).toEqual(response.body);
    return body;
  }

  async function countViews(listId: string): Promise<number> {
    const [row] = await asSystem<{ count: number }>(
      'select count(*)::int as count from saved_views where organization_id = $1 and list_id = $2',
      [organizationId, listId],
    );
    return row?.count ?? 0;
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
    const postgresPort = hostPort('postgres', '5432');
    const natsPort = hostPort('nats', '4222');
    const connectionString = `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task`;
    vi.stubEnv('MIGRATION_DATABASE_URL', connectionString);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await import('../src/migrate.js');
    } finally {
      log.mockRestore();
    }
    migrator = new pg.Pool({ connectionString, max: 3 });
    await asSystem(
      `insert into organization_members (organization_id, id, user_id, role, version)
       values ($1, uuidv7(), $2, 'owner', 1), ($1, uuidv7(), $3, 'guest', 1),
              ($4, uuidv7(), $2, 'owner', 1)`,
      [organizationId, ownerId, commenterId, otherOrganization],
    );

    const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
    if (x === undefined || d === undefined) throw new Error('Missing test JWK key material.');
    const publicJwk = { kty: 'OKP' as const, crv: 'Ed25519' as const, x, kid: 'test-saved-views' };
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
  });

  afterAll(async () => {
    try {
      await app?.close();
      await migrator?.end();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  });

  it('round-trips explicit settings, version conflicts and facts through the real routes', async () => {
    const { spaceId, listId, path } = await createList('Configuration', 'CONF');
    const view = await createView(path, 'Bugs critiques');
    const item = `${path}/${view.id}`;
    expect(view.configuration).toEqual(configuration);
    const grant = await send('put', `/internal/v1/lists/${listId}/grants/${commenterId}`, {
      body: { role: 'comment' },
    });
    expect(grant.status, grant.text).toBe(200);
    const read = await send('get', item, { actorId: commenterId });
    expect(read.status, read.text).toBe(200);
    expect(GetSavedViewInternalResponse.parse(read.body)).toEqual(view);
    expect(read.headers.etag).toBe('"1"');
    const forbidden = await send('patch', item, {
      actorId: commenterId,
      body: { name: 'Interdit' },
    });
    expectProblem(forbidden, 403, 'access.role-insufficient');
    expect(forbidden.body as unknown).toMatchObject({
      details: { role: 'comment', requiredRole: 'edit' },
    });
    expectProblem(
      await send('get', item, { organization: otherOrganization }),
      404,
      'saved-view.not-found',
    );

    const updatedResponse = await send('patch', item, {
      headers: { 'If-Match': '"1"' },
      body: {
        icon: null,
        configuration: {
          groupBy: null,
          filters: { status: null },
          presentation: { sheetSort: { direction: 'desc' } },
          zoom: 2,
        },
      },
    });
    expect(updatedResponse.status, updatedResponse.text).toBe(200);
    const updated = UpdateSavedViewInternalResponse.parse(updatedResponse.body);
    expect(updatedResponse.headers.etag).toBe('"2"');
    expect(updated).toMatchObject({ icon: null, version: 2 });
    expect(updated.configuration).toEqual({
      ...configuration,
      filters: { assignee: ['me', 'none'], label: ['Plateforme'] },
      groupBy: null,
      presentation: {
        hiddenSheetColumns: ['labels'],
        sheetSort: { column: 'name', direction: 'desc' },
      },
    });
    const noOp = await send('patch', item, {
      body: { configuration: { filters: { status: null } } },
    });
    expect(noOp.status, noOp.text).toBe(200);
    expect(noOp.body as unknown).toEqual(updated);
    expectProblem(
      await send('patch', item, { headers: { 'If-Match': '"1"' }, body: { name: 'Périmé' } }),
      412,
      'request.version-mismatch',
    );
    const removed = await send('delete', item, { headers: { 'If-Match': '"2"' } });
    expect(removed.status, removed.text).toBe(204);
    expectProblem(await send('get', item), 404, 'saved-view.not-found');

    const rows = await asSystem<{ payload: unknown }>(
      `select payload from outbox_events where event_name = 'list.saved-view-changed.v1'
       and payload->>'viewId' = $1 order by (payload->>'version')::integer`,
      [view.id],
    );
    const facts = rows.map(({ payload }) => listSavedViewChangedV1Schema.parse(payload));
    expect(facts.map(({ action, version }) => ({ action, version }))).toEqual([
      { action: 'created', version: 1 },
      { action: 'updated', version: 2 },
      { action: 'deleted', version: 3 },
    ]);
    for (const fact of facts) {
      expect(fact).toMatchObject({
        spaceId,
        listId,
        organizationId,
        actor: { type: 'user', id: ownerId },
      });
      expect(fact).not.toHaveProperty('configuration');
    }
  });

  it('persists, merges and clears custom field presentation settings', async () => {
    const { path } = await createList('Préférences', 'PREF');
    const view = await createView(path, 'Colonnes personnalisées');
    const item = `${path}/${view.id}`;
    const fieldId = '019a7000-0000-7000-8000-000000000901';
    const incomplete = await send('patch', item, {
      body: { configuration: { presentation: { customFieldSort: { direction: 'asc' } } } },
    });
    expectProblem(incomplete, 400, 'request.invalid');
    expect(incomplete.body as unknown).toMatchObject({
      details: { issues: [{ path: 'configuration.presentation.customFieldSort' }] },
    });
    const created = await send('patch', item, {
      headers: { 'If-Match': '"1"' },
      body: {
        configuration: {
          presentation: {
            hiddenCustomFieldIds: [fieldId],
            customFieldSort: { fieldId, direction: 'asc' },
          },
        },
      },
    });
    expect(created.status, created.text).toBe(200);
    expect(created.headers.etag).toBe('"2"');
    const after = await send('patch', item, {
      body: { configuration: { presentation: { customFieldSort: { direction: 'desc' } } } },
    });
    expect(after.status, after.text).toBe(200);
    const updated = UpdateSavedViewInternalResponse.parse(after.body);
    expect(updated.configuration.presentation).toEqual({
      ...configuration.presentation,
      hiddenCustomFieldIds: [fieldId],
      customFieldSort: { fieldId, direction: 'desc' },
    });
    const unchanged = await send('patch', item, {
      body: { configuration: { presentation: { customFieldSort: { direction: 'desc' } } } },
    });
    expect(unchanged.headers.etag).toBe(after.headers.etag);
    const cleared = await send('patch', item, {
      body: {
        configuration: { presentation: { hiddenCustomFieldIds: null, customFieldSort: null } },
      },
    });
    expect(cleared.status, cleared.text).toBe(200);
    expect(UpdateSavedViewInternalResponse.parse(cleared.body).configuration.presentation).toEqual(
      configuration.presentation,
    );
  });

  it('inserts a duplicate after the source, preserves the cursor anchor and replays the original creation', async () => {
    const { path } = await createList('Ordre', 'ORD');
    const first = await createView(path, '🧪'.repeat(80));
    const second = await createView(path, 'Second');
    const third = await createView(path, 'Third');
    const firstPage = await send('get', `${path}?limit=2`);
    expect(firstPage.status, firstPage.text).toBe(200);
    const page = ListSavedViewsInternalResponse.parse(firstPage.body);
    expect(page.items.map(({ id }) => id)).toEqual([first.id, second.id]);
    if (page.nextCursor === null) throw new Error('The first page should have a next cursor.');

    const duplicatePath = `${path}/${first.id}/duplicate`;
    expectProblem(await send('post', duplicatePath), 400, 'request.invalid');
    expectProblem(
      await send('post', duplicatePath, { body: { name: 'Extra' } }),
      400,
      'request.invalid',
    );
    const options = { headers: { 'Idempotency-Key': randomUUID(), 'If-Match': '"1"' }, body: {} };
    const chunkedHeaders = {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
      ...options.headers,
    };
    const duplicate = await send('post', duplicatePath, {
      headers: chunkedHeaders,
      chunk: '{}',
    });
    expect(duplicate.status, duplicate.text).toBe(201);
    const clone = DuplicateSavedViewInternalResponse.parse(duplicate.body);
    expect(clone).toMatchObject({ configuration, version: 1, name: `${'🧪'.repeat(72)} (copie)` });
    expect(clone.id).not.toBe(first.id);
    const replay = await send('post', duplicatePath, options);
    expect(replay.status, replay.text).toBe(201);
    expect(replay.body as unknown).toEqual(clone);
    expect(replay.headers.location).toBe(`${path}/${clone.id}`);
    expect(replay.headers.etag).toBe('"1"');
    const emptyReplay = await send('post', duplicatePath, { headers: chunkedHeaders });
    expectProblem(emptyReplay, 400, 'request.invalid');
    const emptyPatch = await send('patch', `${path}/${clone.id}`, {
      headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    });
    expectProblem(emptyPatch, 400, 'request.invalid');

    const full = await send('get', path);
    expect(full.status, full.text).toBe(200);
    expect(ListSavedViewsInternalResponse.parse(full.body).items.map(({ id }) => id)).toEqual([
      first.id,
      clone.id,
      second.id,
      third.id,
    ]);
    const next = await send('get', `${path}?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`);
    expect(next.status, next.text).toBe(200);
    expect(ListSavedViewsInternalResponse.parse(next.body).items.map(({ id }) => id)).toEqual([
      third.id,
    ]);
  });

  it('retains archived settings, hides inactive favorite targets and cleans views synchronously on tombstoning', async () => {
    const { spaceId, listId, path } = await createList('Suppression', 'SUP');
    const view = await createView(path, 'Vue à supprimer');
    const favorites = '/internal/v1/me/favorites';
    const added = await send('post', favorites, {
      body: { kind: 'saved-view', targetId: view.id },
    });
    expect(added.status, added.text).toBe(201);
    const listPath = `/internal/v1/lists/${listId}`;
    const archive = await send('post', `${listPath}/archive`, { body: {} });
    expect(archive.status, archive.text).toBe(200);
    const read = await send('get', `${path}/${view.id}`);
    expect(read.status, read.text).toBe(200);
    expect(GetSavedViewInternalResponse.parse(read.body)).toEqual(view);
    expectProblem(
      await send('patch', `${path}/${view.id}`, { body: { name: 'Changement' } }),
      409,
      'saved-view.list-archived',
    );
    const hidden = await send('get', favorites);
    expect(hidden.status, hidden.text).toBe(200);
    expect(hidden.body as unknown).toMatchObject({ items: [] });
    const unarchive = await send('post', `${listPath}/unarchive`, { body: {} });
    expect(unarchive.status, unarchive.text).toBe(200);
    const deletedView = await send('delete', `${path}/${view.id}`);
    expect(deletedView.status, deletedView.text).toBe(204);
    const rows = await asSystem<{ count: number }>(
      'select count(*)::int as count from favorites where organization_id = $1 and target_id = $2',
      [organizationId, view.id],
    );
    expect(rows[0]?.count).toBe(0);

    await createView(path, 'Vue de liste');
    const deletedList = await send('delete', listPath);
    expect(deletedList.status, deletedList.text).toBe(204);
    expect(await countViews(listId)).toBe(0);

    const second = await send('post', `/internal/v1/spaces/${spaceId}/lists`, {
      body: { name: 'Autre liste' },
    });
    expect(second.status, second.text).toBe(201);
    const next = CreateSpaceInternalResponse.shape.firstList.parse(second.body);
    await createView(`/internal/v1/lists/${next.id}/saved-views`, 'Vue d’espace');
    const deletedSpace = await send('delete', `/internal/v1/spaces/${spaceId}`);
    expect(deletedSpace.status, deletedSpace.text).toBe(204);
    expect(await countViews(next.id)).toBe(0);
  });

  it('rechecks a matching version after a concurrent editor commits', async () => {
    const { path } = await createList('Concurrence', 'CONC');
    const original = await createView(path, 'Version initiale');
    const item = `${path}/${original.id}`;
    const settled = await Promise.all(
      ['Édition A', 'Édition B'].map((name) =>
        send('patch', item, { headers: { 'If-Match': '"1"' }, body: { name } }),
      ),
    );
    expect(settled.map(({ status }) => status).sort()).toEqual([200, 412]);
    const refused = settled.find(({ status }) => status === 412);
    if (refused === undefined) throw new Error('One editor should lose the version race.');
    expectProblem(refused, 412, 'request.version-mismatch');
    expect(refused.body as unknown).toMatchObject({ details: { version: 2 } });

    const removedPresentation = await send('patch', item, {
      body: { configuration: { presentation: null } },
    });
    expect(removedPresentation.status, removedPresentation.text).toBe(200);
    const incomplete = await send('patch', item, {
      body: { configuration: { presentation: { sheetSort: { direction: 'desc' } } } },
    });
    expectProblem(incomplete, 400, 'request.invalid');
    const read = await send('get', item);
    expect(GetSavedViewInternalResponse.parse(read.body).version).toBe(3);
  });

  it('serializes concurrent creates competing for the last available slot', async () => {
    const { listId, path } = await createList('Limite', 'LIM');
    await asSystem(
      `insert into saved_views (organization_id, list_id, position, name, configuration)
       select $1, $2, position, 'Seed ' || position, $3::jsonb from generate_series(1, 49) position`,
      [organizationId, listId, JSON.stringify(configuration)],
    );
    const settled = await Promise.all(
      ['Last slot A', 'Last slot B'].map((name) =>
        send('post', path, { body: { name, configuration } }),
      ),
    );
    expect(settled.map(({ status }) => status).sort()).toEqual([201, 422]);
    const refused = settled.find(({ status }) => status === 422);
    if (refused === undefined) throw new Error('One writer should be refused.');
    expectProblem(refused, 422, 'saved-view.limit-reached');
    expect(await countViews(listId)).toBe(50);
  });
});
