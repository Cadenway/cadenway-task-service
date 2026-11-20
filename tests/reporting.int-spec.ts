import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  CreateListInternalResponse,
  CreateSpaceCustomFieldInternalResponse,
  CreateSpaceInternalResponse,
  CreateTaskInternalResponse,
  ExportListTasksInternalResponse,
  GetTaskInternalResponse,
  GetListTimesheetInternalResponse,
  GetListWorkloadInternalResponse,
  GetSprintReportInternalResponse,
  GetTeamDashboardInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import {
  createApplication,
  InternalTokenSigner,
  loadConfig,
  remainingBudgetMs,
  REQUEST_TIMEOUT_HEADER,
} from '@cadenway/nest-common';
import type { Ed25519PublicJwk } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import { ExportListTasks } from '../src/modules/tasks/application/use-cases/queries/reporting/export-list-tasks/export-list-tasks.use-case.js';

const project = `task-reporting-test-${String(process.pid)}`;
const organizationId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const otherOrganizationId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e20';
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

describe('reports with PostgreSQL and NATS', () => {
  let app: NestExpressApplication | undefined;
  let db: pg.Pool | undefined;
  let signer: InternalTokenSigner;
  let spaceId: string;
  let listId: string;
  let sprintId: string;
  let sprintKey: string;
  let pointsId: string;
  const today = new Date().toISOString().slice(0, 10);
  const day = new Date(`${today}T12:00:00Z`);
  const monday = new Date(day);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);
  const start = new Date(day);
  const end = new Date(day);
  start.setUTCDate(start.getUTCDate() - 1);
  end.setUTCDate(end.getUTCDate() + 1);

  async function send(
    method: 'get' | 'head' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    options: {
      body?: object;
      actor?: string;
      org?: string;
      accept?: string;
      text?: boolean;
      timeoutMs?: number;
    } = {},
  ): Promise<request.Response> {
    if (app === undefined) throw new Error('Application did not start');
    const token = await signer.sign('task-service', {
      actor: { type: 'user', id: options.actor ?? camille },
      organizationId: options.org ?? organizationId,
    });
    let call = request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined) call = call.send(options.body);
    if (options.accept !== undefined) call = call.set('Accept', options.accept);
    if (options.timeoutMs !== undefined) {
      call = call.set(REQUEST_TIMEOUT_HEADER, String(options.timeoutMs));
    }
    if (options.text === true) {
      call = call.buffer(true).parse((incoming, done) => {
        let body = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => {
          body += chunk;
        });
        incoming.on('end', () => {
          done(null, body);
        });
        incoming.on('error', (error: Error) => {
          done(error, undefined);
        });
      });
    }
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
    const connection = await db.connect();
    try {
      await connection.query('begin');
      await connection.query("select set_config('app.system_access', 'on', true)");
      await connection.query(
        `insert into organization_members (organization_id,id,user_id,role,version)
         values ($1,$2,$3,'owner',1),($1,$4,$5,'member',1),($6,$7,$5,'owner',1)`,
        [
          organizationId,
          randomUUID(),
          camille,
          randomUUID(),
          hugo,
          otherOrganizationId,
          randomUUID(),
        ],
      );
      await connection.query('commit');
    } finally {
      connection.release();
    }
    const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
    if (x === undefined || d === undefined) throw new Error('Missing test key material');
    const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'reports-test' };
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
    const sprint = await send('post', `/internal/v1/spaces/${spaceId}/lists`, {
      body: {
        name: 'Sprint 14',
        sprint: {
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
        },
      },
    });
    expect(sprint.status, sprint.text).toBe(201);
    sprintId = CreateListInternalResponse.parse(sprint.body as unknown).id;
    const field = await send('post', `/internal/v1/spaces/${spaceId}/custom-fields`, {
      body: { name: 'Points', type: 'number' },
    });
    expect(field.status, field.text).toBe(201);
    pointsId = CreateSpaceCustomFieldInternalResponse.parse(field.body as unknown).id;
    expect(
      (
        await send('patch', `/internal/v1/spaces/${spaceId}/custom-fields/${pointsId}`, {
          body: { sprintPoints: true },
        })
      ).status,
    ).toBe(200);
    const task = await send('post', `/internal/v1/lists/${sprintId}/tasks`, {
      body: {
        name: 'Refondre l’écran de connexion SSO',
        estimateMinutes: 120,
        startDate: weekStart,
        dueDate: weekStart,
      },
    });
    expect(task.status, task.text).toBe(201);
    sprintKey = CreateTaskInternalResponse.parse(task.body as unknown).key;
    expect(
      (
        await send('patch', `/internal/v1/tasks/${sprintKey}`, {
          body: { customFieldValues: { [pointsId]: 0 } },
        })
      ).status,
    ).toBe(200);
    const time = await send('post', `/internal/v1/tasks/${sprintKey}/time-entries`, {
      body: { minutes: 90, workDate: weekStart },
    });
    expect(time.status, time.text).toBe(201);
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

  describe('sprint history keeps unavailable opening and a zero point value', () => {
    it('returns the current zero-point task and never fabricates its pre-coverage opening', async () => {
      const response = await send(
        'get',
        `/internal/v1/lists/${sprintId}/sprint-report?today=${today}&timeZone=UTC`,
      );
      expect(response.status, response.text).toBe(200);
      const report = GetSprintReportInternalResponse.parse(response.body as unknown);
      expect(report.coverageStartedAt).not.toBeNull();
      expect(report.openingPoints).toBeNull();
      expect(report.remaining).toMatchObject({ points: 0, taskCount: 1 });
      expect(report.remaining?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ taskKey: sprintKey, points: 0 })]),
      );
    });

    it('refuses the private sprint to another member and another organization', async () => {
      const path = `/internal/v1/lists/${sprintId}/sprint-report?today=${today}&timeZone=UTC`;
      expect((await send('get', path, { actor: hugo })).status).toBe(404);
      expect((await send('get', path, { actor: hugo, org: otherOrganizationId })).status).toBe(404);
    });

    it('rechecks the moved task against current visibility and preserves the cursor observation', async () => {
      const path = `/internal/v1/lists/${sprintId}/sprint-report?today=${today}&timeZone=UTC`;
      const grant = await send('put', `/internal/v1/lists/${sprintId}/grants/${hugo}`, {
        body: { role: 'view' },
      });
      expect(grant.status, grant.text).toBe(200);
      const first = await send('get', `${path}&limit=1`, { actor: hugo });
      expect(first.status, first.text).toBe(200);
      const page = GetSprintReportInternalResponse.parse(first.body as unknown);
      expect(page.nextCursor).not.toBeNull();
      const move = await send('patch', `/internal/v1/tasks/${sprintKey}`, {
        body: { listId },
      });
      expect(move.status, move.text).toBe(200);
      const next = await send(
        'get',
        `${path}&limit=1&cursor=${encodeURIComponent(page.nextCursor ?? '')}`,
        {
          actor: hugo,
        },
      );
      expect(next.status, next.text).toBe(200);
      const resumed = GetSprintReportInternalResponse.parse(next.body as unknown);
      expect(resumed.observedAt).toBe(page.observedAt);
      expect(resumed.remaining?.items ?? []).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ taskKey: sprintKey })]),
      );
      const restore = await send('patch', `/internal/v1/tasks/${sprintKey}`, {
        body: { listId: sprintId },
      });
      expect(restore.status, restore.text).toBe(200);
      expect((await send('delete', `/internal/v1/lists/${sprintId}/grants/${hugo}`)).status).toBe(
        204,
      );
    });
  });

  describe('reporting windows and authorized CSV rows', () => {
    it('uses the complete workload and time totals for the visible list', async () => {
      const workload = await send(
        'get',
        `/internal/v1/lists/${sprintId}/workload?weekStart=${weekStart}`,
      );
      expect(workload.status, workload.text).toBe(200);
      expect(GetListWorkloadInternalResponse.parse(workload.body as unknown)).toMatchObject({
        totalMinutes: 120,
        items: [expect.objectContaining({ taskKey: sprintKey, totalMinutes: 120 })],
      });
      const timesheet = await send(
        'get',
        `/internal/v1/lists/${sprintId}/timesheet?weekStart=${weekStart}`,
      );
      expect(timesheet.status, timesheet.text).toBe(200);
      expect(GetListTimesheetInternalResponse.parse(timesheet.body as unknown)).toMatchObject({
        totalMinutes: 90,
        items: [expect.objectContaining({ taskKey: sprintKey, totalMinutes: 90 })],
      });
    });

    it('quotes formula-like task names and filters out unrelated rows before export', async () => {
      const formula = await send('post', `/internal/v1/lists/${listId}/tasks`, {
        body: { name: '=SUM(1,2)' },
      });
      expect(formula.status, formula.text).toBe(201);
      const response = await send('get', `/internal/v1/lists/${listId}/tasks/export?search=SUM`);
      expect(response.status, response.text).toBe(200);
      expect(response.headers).toMatchObject({
        'content-type': 'application/json; charset=utf-8',
        'transfer-encoding': 'chunked',
      });
      const exported = ExportListTasksInternalResponse.parse(response.body as unknown);
      expect(exported.rows).toHaveLength(1);
      expect(exported.rows[0]?.beforeAssignees[1]).toContain("'=SUM(1,2)");
    });

    it('answers HEAD for an accessible export and preserves the invisible list refusal', async () => {
      const path = `/internal/v1/lists/${listId}/tasks/export`;
      const visible = await send('head', path);
      expect(visible.status).toBe(200);
      expect(visible.headers).toMatchObject({ 'content-type': 'application/json; charset=utf-8' });
      expect(visible.text).toBeFalsy();
      expect((await send('head', path, { actor: hugo })).status).toBe(404);
    });

    it('requires an explicit eligible Accept type and streams the same authorized snapshot as NDJSON', async () => {
      const path = `/internal/v1/lists/${sprintId}/tasks/export?search=Refondre`;
      const json = await send('get', path, { accept: '*/*' });
      expect(json.status, json.text).toBe(200);
      expect(json.headers).toMatchObject({
        'content-type': 'application/json; charset=utf-8',
        vary: 'Accept',
      });
      for (const accept of [
        'application/x-ndjson;q=0, */*',
        'application/json;q=1, application/x-ndjson;q=0.5',
      ]) {
        const fallback = await send('get', path, { accept });
        expect(fallback.headers).toMatchObject({
          'content-type': 'application/json; charset=utf-8',
        });
      }
      const denied = await send('get', path, { accept: 'application/x-ndjson', actor: hugo });
      expect(denied.status).toBe(404);
      expect(denied.headers['content-type']).toMatch(/^application\/problem\+json/);
      const output = await send('get', path, { accept: 'application/x-ndjson', text: true });
      expect(output.status, output.text).toBe(200);
      expect(output.headers).toMatchObject({
        'content-type': 'application/x-ndjson; charset=utf-8',
        'transfer-encoding': 'chunked',
        vary: 'Accept',
      });
      const exported = ExportListTasksInternalResponse.parse(json.body as unknown);
      expect(exported.rows).toHaveLength(1);
      expect(exported.rows[0]?.afterAssignees[2]).toBe('"0"');
      const text: unknown = output.body;
      if (typeof text !== 'string') throw new Error('The NDJSON stream was not captured as text.');
      expect(text.endsWith('\n')).toBe(true);
      expect(
        text
          .trimEnd()
          .split('\n')
          .map((line): unknown => JSON.parse(line)),
      ).toEqual([
        { kind: 'metadata', filename: exported.filename, header: exported.header },
        ...exported.rows.map((row) => ({ kind: 'row', row })),
        { kind: 'complete', rowCount: exported.rows.length },
      ]);
    });

    it('applies the export budget and the lower bound from the verified internal request', async () => {
      if (app === undefined) throw new Error('Application did not start');
      const operation = app.get(ExportListTasks);
      const execute = operation.execute.bind(operation);
      const budgets: (number | undefined)[] = [];
      const capture = vi.spyOn(operation, 'execute').mockImplementation((input, sink) => {
        budgets.push(remainingBudgetMs());
        return execute(input, sink);
      });
      try {
        const path = `/internal/v1/lists/${listId}/tasks/export?search=SUM`;
        const response = await send('get', path, { timeoutMs: 30_000 });
        expect(response.status, response.text).toBe(200);
        expect(budgets).toHaveLength(1);
        expect(budgets[0]).toBeGreaterThan(10_000);
        expect(budgets[0]).toBeLessThanOrEqual(30_000);
      } finally {
        capture.mockRestore();
      }
    });

    it('returns the team dashboard in the requested time zone and blocks private data', async () => {
      const path = `/internal/v1/reports/team-dashboard?today=${today}&timeZone=Europe%2FParis`;
      const owner = await send('get', path);
      expect(owner.status, owner.text).toBe(200);
      const visible = GetTeamDashboardInternalResponse.parse(owner.body as unknown);
      expect(visible).toMatchObject({ today, timeZone: 'Europe/Paris', weeks: 8 });
      const member = await send('get', path, { actor: hugo });
      expect(member.status, member.text).toBe(200);
      const hidden = GetTeamDashboardInternalResponse.parse(member.body as unknown);
      expect(hidden.openCount).toBeLessThan(visible.openCount);
    });

    it('excludes both live work and durable completions when their list is archived', async () => {
      const dashboard = async () => {
        const response = await send(
          'get',
          `/internal/v1/reports/team-dashboard?today=${today}&timeZone=UTC`,
        );
        expect(response.status, response.text).toBe(200);
        return GetTeamDashboardInternalResponse.parse(response.body as unknown);
      };
      const baseline = await dashboard();
      const list = await send('post', `/internal/v1/spaces/${spaceId}/lists`, {
        body: { name: 'Relances produit' },
      });
      expect(list.status, list.text).toBe(201);
      const archivedListId = CreateListInternalResponse.parse(list.body as unknown).id;
      const created = await send('post', `/internal/v1/lists/${archivedListId}/tasks`, {
        body: {
          name: 'Revoir les maquettes',
          assigneeIds: [camille],
          dueDate: start.toISOString().slice(0, 10),
        },
      });
      expect(created.status, created.text).toBe(201);
      const taskKey = CreateTaskInternalResponse.parse(created.body as unknown).key;
      const taskPath = `/internal/v1/tasks/${taskKey}`;
      for (const status of ['done', 'blocked']) {
        const changed = await send('patch', taskPath, { body: { status } });
        expect(changed.status, changed.text).toBe(200);
      }

      const before = await dashboard();
      expect(before.openCount).toBe(baseline.openCount + 1);
      expect(before.lateCount).toBe(baseline.lateCount + 1);
      expect(before.blockedCount).toBe(baseline.blockedCount + 1);
      expect(before.completedCount).toBe(baseline.completedCount + 1);
      expect(before.overdueTasks).toContainEqual(expect.objectContaining({ key: taskKey }));

      const archived = await send('post', `/internal/v1/lists/${archivedListId}/archive`, {
        body: {},
      });
      expect(archived.status, archived.text).toBe(200);
      const task = await send('get', taskPath);
      expect(task.status, task.text).toBe(200);
      expect(GetTaskInternalResponse.parse(task.body as unknown)).toMatchObject({
        archivedAt: null,
        status: 'blocked',
      });
      const after = await dashboard();
      expect(after).toEqual({ ...baseline, observedAt: after.observedAt });
    });

    it('keeps an archived sprint readable and falls back to estimate after retiring points', async () => {
      const retired = await send(
        'delete',
        `/internal/v1/spaces/${spaceId}/custom-fields/${pointsId}`,
      );
      expect(retired.status, retired.text).toBe(204);
      const archived = await send('post', `/internal/v1/lists/${sprintId}/archive`, { body: {} });
      expect(archived.status, archived.text).toBe(200);
      const response = await send(
        'get',
        `/internal/v1/lists/${sprintId}/sprint-report?today=${today}&timeZone=UTC`,
      );
      expect(response.status, response.text).toBe(200);
      const report = GetSprintReportInternalResponse.parse(response.body as unknown);
      expect(report.remaining).toMatchObject({ points: 2, taskCount: 1 });
    });
  });
});
