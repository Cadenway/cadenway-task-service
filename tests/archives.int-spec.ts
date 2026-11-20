import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { eventSchemas as taskEventSchemas } from '@cadenway/contracts/events/task-service';
import type { MemberJoinedV1 } from '@cadenway/contracts/events/organization-service';
import {
  AddChecklistItemInternalResponse,
  AddTaskLabelInternalResponse,
  ApproveAccessRequestInternalResponse,
  ArchiveListInternalResponse,
  ArchiveTaskInternalResponse,
  AssignTaskInternalResponse,
  CheckListAccessInternalResponse,
  CheckTaskAccessInternalResponse,
  CountTaskGroupsInternalResponse,
  CreateListInternalResponse,
  CreateSpaceInternalResponse,
  CreateSubtaskInternalResponse,
  CreateTaskInternalResponse,
  GetHomeInternalResponse,
  GetListCountsInternalResponse,
  GetListInternalResponse,
  GetSpaceOverviewInternalResponse,
  GetTaskDetailInternalResponse,
  GetTaskInternalResponse,
  ListAccessRequestsInternalResponse,
  ListArchivedListsInternalResponse,
  ListArchivedTasksInternalResponse,
  ListLabelsInternalResponse,
  ListListActivityInternalResponse,
  ListListGrantsInternalResponse,
  ListListsInternalResponse,
  ListMyTasksInternalResponse,
  ListSubtasksInternalResponse,
  ListTaskActivityInternalResponse,
  ListTasksInternalResponse,
  SetListGrantInternalResponse,
  SetSpaceGrantInternalResponse,
  UnarchiveListInternalResponse,
  UnarchiveTaskInternalResponse,
  UpdateListInternalResponse,
  UpdateTaskInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import {
  createApplication,
  getOrganizationContext,
  InternalTokenSigner,
  loadConfig,
  runWithOrganizationContext,
} from '@cadenway/nest-common';
import type {
  Ed25519PrivateJwk,
  Ed25519PublicJwk,
  OrganizationContext,
} from '@cadenway/nest-common';
import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { TransactionClient } from '@cadenway/nest-common/database';
import { startTelemetry } from '@cadenway/nest-common/telemetry';
import type { TelemetryHandle } from '@cadenway/nest-common/telemetry';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';

// The archives of P3b-1 (PR 2) on a disposable PostgreSQL and NATS: the archive and the
// restoration of a list and of a task with its subtree, what an archived list or task is left out
// of and what it keeps, the `409 task.archived` of every change of an archived task, the
// restoration of a whole archive from any member with the rules that detach its root, the two pages
// "Archives", access requests on archived targets, the isolation of the organizations and the
// concurrency of the archive and the restoration. The service runs as main.ts assembles it (the
// `task_app` role, the `task` NATS user), started from compose.dev.yaml as a throwaway Compose
// project on free ports, as tests/access.int-spec.ts does. The members come from the copy of the
// memberships, fed the way organization-service feeds it: `member.joined.v1` published to `EVENTS`
// with the `admin` user of the `nats-streams` container. The routes are called with internal tokens
// of the API gateway and of the realtime gateway, and their answers are checked against the
// validators generated from `openapi/internal/task-service.yaml`; the outbox rows are checked
// against the schemas of `asyncapi/task-service.yaml`. Rows are read as the migrator role with the
// system access of the policies, since row-level security is forced on every table. The
// OpenTelemetry SDK of the kit runs as `src/telemetry.ts` starts it, without an exporter, so that the
// rows of a request carry its `traceparent`. The scenarios run in the order of the file and pass
// their state on.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-archives-${String(process.pid)}`;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** A second organization, with its own owner, which must never meet a row of Atelier Nord. */
const atelierDeltaId = '01938f6e-0000-7000-8000-000000000002';

/** The date of the scenarios, inside Sprint 14. */
const today = '2026-11-08';

/** A date inside Sprint 13, for the current sprints of "Accueil". */
const inSprint13 = '2026-10-25';

/** An `If-Match` no version of the scenarios reaches. */
const stale: Readonly<Record<string, string>> = { 'If-Match': '"99"' };

/** A person, by account and by membership. */
interface Person {
  readonly userId: string;
  readonly memberId: string;
}

/** Camille Martin (CM), owner of Atelier Nord. */
const camille: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24',
  memberId: '01938f6e-9000-7000-8000-0000000000c1',
};

/** Inès Robert (IR), admin of Atelier Nord. */
const ines: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c25',
  memberId: '01938f6e-9000-7000-8000-0000000000c2',
};

/** Hugo Dubois (HD), member of Atelier Nord, owner of the private space "Recherche". */
const hugo: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c26',
  memberId: '01938f6e-9000-7000-8000-0000000000c3',
};

/** Léa Petit (LP), member of Atelier Nord, given `view` on "Recherche". */
const lea: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c27',
  memberId: '01938f6e-9000-7000-8000-0000000000c4',
};

/** Nadia Benali, guest of Atelier Nord, who sees the lists of the archives shared with her. */
const nadia: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c28',
  memberId: '01938f6e-9000-7000-8000-0000000000c6',
};

/** Rose Lambert, guest of Atelier Nord, given access to an archived list. */
const rose: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2b',
  memberId: '01938f6e-9000-7000-8000-0000000000c9',
};

/** Chloé Girard, guest of Atelier Nord, who is given access to nothing. */
const chloe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2d',
  memberId: '01938f6e-9000-7000-8000-0000000000cc',
};

/** Noé Perrin, guest of Atelier Nord, who asks for access to archived targets. */
const noe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2e',
  memberId: '01938f6e-9000-7000-8000-0000000000d1',
};

/**
 * Mathis Roux, guest of Atelier Nord, given `edit` on the list of an archived root and nothing on
 * the list its parent moves to.
 */
const mathis: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2a',
  memberId: '01938f6e-9000-7000-8000-0000000000c8',
};

/** Lucie Fabre, guest of Atelier Nord, who loses a grant while she walks the pages "Archives". */
const lucie: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c32',
  memberId: '01938f6e-9000-7000-8000-0000000000d3',
};

/** Solène Garnier, owner of the second organization. */
const solene: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c29',
  memberId: '01938f6e-9000-7000-8000-0000000000c7',
};

/** A row of `outbox_events`, as the spec reads it. */
interface OutboxRow {
  readonly id: string;
  readonly event_name: string;
  readonly payload: unknown;
}

/** The members of a payload the spec finds the outbox rows by. */
type PayloadMember = 'listId' | 'key' | 'rootKey' | 'accessRequestId';

/** The issuers the service trusts. */
type Issuer = 'api-gateway' | 'realtime-gateway';

/** HTTP verbs the spec uses. */
type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** A role of a grant. */
type Role = 'edit' | 'comment' | 'view';

/** Query parameters of a read. */
type Query = Readonly<Record<string, string | number | undefined>>;

/** What a call adds to its path. */
interface SendOptions {
  readonly organizationId?: string;
  readonly body?: object;
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly issuer?: Issuer;
}

/** A space and its first list, as the creation answers them. */
type SpaceCreated = z.output<typeof CreateSpaceInternalResponse>;

/** A list or a sprint, as the routes answer it. */
type ListBody = z.output<typeof GetListInternalResponse>;

/** A task, as the routes answer it. */
type TaskBody = z.output<typeof GetTaskInternalResponse>;

/** The overview of a space. */
type OverviewBody = z.output<typeof GetSpaceOverviewInternalResponse>;

/** The task part of "Accueil". */
type HomeBody = z.output<typeof GetHomeInternalResponse>;

/** One page of "Mes tâches". */
type MyTasksBody = z.output<typeof ListMyTasksInternalResponse>;

/** One page of the tab "Listes" of "Archives". */
type ArchivedListPageBody = z.output<typeof ListArchivedListsInternalResponse>;

/** One page of the tab "Tâches" of "Archives". */
type ArchivedTaskPageBody = z.output<typeof ListArchivedTasksInternalResponse>;

/**
 * Runs `docker compose` on the throwaway project.
 *
 * @param args - Compose command and its arguments.
 * @returns The standard output.
 */
function compose(...args: readonly string[]): string {
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

/**
 * Reads the published host port of a service of the project.
 *
 * @param service - Compose service.
 * @param port - Port inside the container.
 * @returns The host port.
 */
function hostPort(service: string, port: string): string {
  return compose('port', service, port).trim().split(':').at(-1) ?? '';
}

/**
 * Publishes `member.joined.v1` as organization-service emits it, with the `admin` user, waiting for
 * the acknowledgement of the stream.
 *
 * @param organizationId - Organization of the membership.
 * @param person - The membership and its account.
 * @param role - Role of the membership.
 */
function join(organizationId: string, person: Person, role: MemberJoinedV1['role']): void {
  const id = randomUUID();
  const payload: MemberJoinedV1 = {
    id,
    occurredAt: new Date().toISOString(),
    organizationId,
    version: 1,
    memberId: person.memberId,
    userId: person.userId,
    role,
    actor: { type: 'user', id: person.userId },
    invitationId: null,
  };
  compose(
    'exec',
    '-T',
    'nats-streams',
    'nats',
    'pub',
    '--jetstream',
    '--header',
    `Nats-Msg-Id:${id}`,
    'evt.member.joined.v1',
    JSON.stringify(payload),
  );
}

/**
 * Creates an Ed25519 key pair of an issuer in the JWK forms the internal token uses.
 *
 * @param kid - Id of the key.
 * @returns The public key for the verifier and the private key for the signer.
 */
function keyPair(kid: string): {
  readonly publicJwk: Ed25519PublicJwk;
  readonly privateJwk: Ed25519PrivateJwk;
} {
  const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  if (x === undefined || d === undefined) {
    throw new Error('Node returned an Ed25519 JWK without its key material.');
  }
  const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid };
  return { publicJwk, privateJwk: { ...publicJwk, d } };
}

/**
 * The organization context of a member of an organization, as the internal token gives it.
 *
 * @param organizationId - Organization of the context.
 * @returns The context the tenant runner reads.
 */
function contextOf(organizationId: string): OrganizationContext {
  return {
    organizationId,
    actor: { type: 'user', id: solene.userId },
    role: null,
    scopes: [],
  };
}

/**
 * Checks a body against a schema generated from the contract: it must parse and the parse must
 * drop nothing, so that a member the contract does not declare fails the check.
 *
 * @param schema - Validator of `@cadenway/contracts`.
 * @param body - What the route or the outbox returned.
 * @returns The parsed body.
 */
function conforms<TSchema extends z.ZodType>(schema: TSchema, body: unknown): z.output<TSchema> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(`The body does not match the contract: ${JSON.stringify(result.error.issues)}`);
  }
  expect(result.data).toEqual(body);
  return result.data;
}

/**
 * The body of a response, typed for the checks above.
 *
 * @param response - A supertest response.
 * @returns Its parsed body.
 */
function bodyOf(response: request.Response): unknown {
  return response.body as unknown;
}

/**
 * Checks a refusal: its status, the problem media type, the stable code and, when given, details.
 *
 * @param response - A supertest response.
 * @param status - Expected HTTP status.
 * @param code - Expected stable machine code.
 * @param details - Expected members of `details`.
 */
function expectProblem(
  response: request.Response,
  status: number,
  code: string,
  details?: Readonly<Record<string, unknown>>,
): void {
  expect(response.status, response.text).toBe(status);
  expect(response.headers['content-type']).toMatch(/^application\/problem\+json/u);
  expect(bodyOf(response)).toMatchObject({
    status,
    code,
    ...(details === undefined ? {} : { details }),
  });
}

/**
 * The ETag of a version.
 *
 * @param version - The version.
 * @returns `"<version>"`.
 */
function etagOf(version: number): string {
  return `"${String(version)}"`;
}

/**
 * The query string of a read.
 *
 * @param params - The parameters; `undefined` ones are left out.
 * @returns `?a=b&c=d`, or an empty string.
 */
function queryOf(params: Query): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/**
 * The instant of an ISO date-time, to compare two serializations of one instant.
 *
 * @param value - An ISO date-time, or `null`.
 * @returns Milliseconds since the epoch.
 */
function instantOf(value: string | null | undefined): number {
  if (value === null || value === undefined) {
    throw new Error('No instant.');
  }
  return Date.parse(value);
}

/**
 * Checks that every space and every list in an answer carries the access of the caller, which
 * this service always answers: `callerRole` and `callerCanManage` on a space, `organizationAccess`
 * and `callerRole` on a list. A space is an object with `statuses` and `nextKey`, a list one with
 * `spaceId`, `color` and `sprint`.
 *
 * @param body - What a route answered.
 */
function expectAccessMembers(body: unknown): void {
  if (Array.isArray(body)) {
    for (const item of body as readonly unknown[]) {
      expectAccessMembers(item);
    }
    return;
  }
  if (typeof body !== 'object' || body === null) {
    return;
  }
  const record = body as Readonly<Record<string, unknown>>;
  if ('statuses' in record && 'nextKey' in record) {
    expect([null, 'edit', 'comment', 'view']).toContain(record.callerRole);
    expect(typeof record.callerCanManage).toBe('boolean');
  } else if ('spaceId' in record && 'color' in record && 'sprint' in record) {
    expect(typeof record.organizationAccess).toBe('boolean');
    expect(['edit', 'comment', 'view']).toContain(record.callerRole);
  }
  for (const value of Object.values(record)) {
    expectAccessMembers(value);
  }
}

/**
 * Checks that nothing in an answer is archived, as every answer read while nothing is archived:
 * each `TaskList` (an object with `spaceId`, `color` and `sprint`) and each `Task` (an object with
 * `key` and `checklist`) carries `archivedAt: null` and `archivedBy: null`, both present; a
 * `TaskSummary` (with `checklistCounts`, without `checklist`) carries neither, since the contract
 * gives it nothing new.
 *
 * @param body - What a route answered.
 * @returns How many lists and tasks the check met, so that a test can tell it was not vacuous.
 */
function expectNothingArchived(body: unknown): { lists: number; tasks: number; summaries: number } {
  const met = { lists: 0, tasks: 0, summaries: 0 };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value as readonly unknown[]) {
        visit(item);
      }
      return;
    }
    if (typeof value !== 'object' || value === null) {
      return;
    }
    const record = value as Readonly<Record<string, unknown>>;
    if ('spaceId' in record && 'color' in record && 'sprint' in record) {
      met.lists += 1;
      expect(record).toHaveProperty('archivedAt', null);
      expect(record).toHaveProperty('archivedBy', null);
    } else if ('key' in record && 'checklist' in record) {
      met.tasks += 1;
      expect(record).toHaveProperty('archivedAt', null);
      expect(record).toHaveProperty('archivedBy', null);
    } else if ('key' in record && 'checklistCounts' in record) {
      met.summaries += 1;
      expect(record).not.toHaveProperty('archivedAt');
      expect(record).not.toHaveProperty('archivedBy');
    }
    for (const member of Object.values(record)) {
      visit(member);
    }
  };
  visit(body);
  return met;
}

describe('the archives of lists and tasks', () => {
  const apiGateway = keyPair('test-api-gateway');
  const realtimeGateway = keyPair('test-realtime-gateway');
  let app: NestExpressApplication | undefined;
  let telemetry: TelemetryHandle | undefined;
  const signers = new Map<Issuer, InternalTokenSigner>();
  let migrator: pg.Pool;

  // The fixture every scenario shares, created once the members are known.
  let produit: SpaceCreated;
  let sprint13: ListBody;
  let sprint14: ListBody;
  let backlog: ListBody;
  let recherche: SpaceCreated;
  let entretiens: ListBody;
  let synthese: ListBody;
  let gridUpdate: TaskBody;
  let cookieBanner: TaskBody;
  let interviewGuide: TaskBody;

  /**
   * The running application.
   *
   * @returns The application created in `beforeAll`.
   */
  function service(): NestExpressApplication {
    if (app === undefined) {
      throw new Error('The application did not start.');
    }
    return app;
  }

  /**
   * Calls a route of the service as a gateway does, acting for a member.
   *
   * @param method - HTTP verb.
   * @param path - Path of the route, with its query.
   * @param actor - The account the gateway acts for.
   * @param options - Organization (Atelier Nord by default), issuer, body and headers.
   * @returns The response.
   */
  async function send(
    method: HttpMethod,
    path: string,
    actor: { readonly userId: string },
    options: SendOptions = {},
  ): Promise<request.Response> {
    const signer = signers.get(options.issuer ?? 'api-gateway');
    if (signer === undefined) {
      throw new Error('No signer for the issuer.');
    }
    const token = await signer.sign('task-service', {
      actor: { type: 'user', id: actor.userId },
      organizationId: options.organizationId ?? atelierNordId,
    });
    let call = request(service().getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${token}`);
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      call = call.set(name, value);
    }
    if (options.text !== undefined) {
      call = call.set('Content-Type', 'text/plain').send(options.text);
    } else if (options.body !== undefined) {
      call = call.send(options.body);
    }
    const response = await call;
    return response;
  }

  /**
   * Runs a statement as the migrator role with the system access of the policies, since row-level
   * security is forced on its own tables.
   *
   * @param sql - The statement.
   * @param params - Its parameters.
   * @returns The rows it returns.
   */
  async function asSystem<TRow extends pg.QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<TRow[]> {
    const client = await migrator.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.system_access', 'on', true)`);
      const result = await client.query<TRow>(sql, [...params]);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reads the outbox rows whose payload names a value, oldest first (ids come from `uuidv7()`).
   *
   * @param member - The member of the payload that holds the value.
   * @param value - The value.
   * @returns The rows.
   */
  async function outboxOf(member: PayloadMember, value: string): Promise<OutboxRow[]> {
    return asSystem<OutboxRow>(
      `select id::text as id, event_name, payload from outbox_events
        where payload ->> '${member}' = $1 order by id`,
      [value],
    );
  }

  /**
   * Reads the outbox rows appended after a known count of rows for a value, oldest first.
   *
   * @param member - The member of the payload that holds the value.
   * @param value - The value.
   * @param before - How many rows of that value there were before.
   * @returns The rows appended since.
   */
  async function outboxSince(
    member: PayloadMember,
    value: string,
    before: number,
  ): Promise<OutboxRow[]> {
    return (await outboxOf(member, value)).slice(before);
  }

  /**
   * Reads the `task.unarchived.v1` a restoration appended for an archive, checked against the
   * contract.
   *
   * @param rootKey - The key of the root of the archive.
   * @param before - How many rows named that root before the restoration.
   * @returns The key, the root and the parent each event carries, in the order of the outbox.
   */
  async function unarchivedSince(
    rootKey: string,
    before: number,
  ): Promise<
    { readonly key: string; readonly rootKey: string; readonly parentKey: string | null }[]
  > {
    const rows = await outboxSince('rootKey', rootKey, before);
    expect(rows.map((row) => row.event_name)).toEqual(rows.map(() => 'task.unarchived.v1'));
    return rows.map((row) => {
      const payload = conforms(taskEventSchemas['task.unarchived.v1'], row.payload);
      return { key: payload.key, rootKey: payload.rootKey, parentKey: payload.parentKey };
    });
  }

  /**
   * Counts every row of the outbox, so that a test can tell a call appended nothing.
   *
   * @returns The number of rows.
   */
  async function outboxTotal(): Promise<number> {
    const [row] = await asSystem<{ readonly total: number }>(
      'select count(*)::int as total from outbox_events',
    );
    return row?.total ?? 0;
  }

  /**
   * Reads the archive root of tasks as stored.
   *
   * @param ids - The tasks.
   * @returns The id of the root of the archive of each, `null` for a live task, by task id.
   */
  async function archiveRootsOf(ids: readonly string[]): Promise<Map<string, string | null>> {
    const rows = await asSystem<{ readonly id: string; readonly archive_root_id: string | null }>(
      `select id::text as id, archive_root_id::text as archive_root_id from tasks
        where organization_id = $1 and id = any($2::uuid[])`,
      [atelierNordId, ids],
    );
    return new Map(rows.map((row) => [row.id, row.archive_root_id]));
  }

  /**
   * Reads the id of a task by its key, as stored.
   *
   * @param key - The key.
   * @returns The id.
   */
  async function taskIdOf(key: string): Promise<string> {
    const [row] = await asSystem<{ readonly id: string }>(
      `select id::text as id from tasks
        where key_prefix = split_part($1, '-', 1) and key_number = split_part($1, '-', 2)::int`,
      [key],
    );
    if (row === undefined) {
      throw new Error(`No task ${key}.`);
    }
    return row.id;
  }

  /**
   * Calls a read route, checks `200` and the answer against the contract.
   *
   * @param schema - The validator of the answer.
   * @param path - Path of the route, without its query.
   * @param actor - Who reads.
   * @param query - The query parameters.
   * @param options - Organization and issuer.
   * @returns The answer.
   */
  async function read<TSchema extends z.ZodType>(
    schema: TSchema,
    path: string,
    actor: Person,
    query: Query = {},
    options: SendOptions = {},
  ): Promise<z.output<TSchema>> {
    const response = await send('get', `${path}${queryOf(query)}`, actor, options);
    expect(response.status, `GET ${path}: ${response.text}`).toBe(200);
    const body = conforms(schema, bodyOf(response));
    expectAccessMembers(body);
    return body;
  }

  /**
   * Creates a space and checks the answer against the contract.
   *
   * @param actor - Who creates.
   * @param body - The space.
   * @param organizationId - Organization of the actor, Atelier Nord by default.
   * @returns The space and its first list.
   */
  async function createSpace(
    actor: Person,
    body: object,
    organizationId: string = atelierNordId,
  ): Promise<SpaceCreated> {
    const response = await send('post', '/internal/v1/spaces', actor, { body, organizationId });
    expect(response.status, response.text).toBe(201);
    const created = conforms(CreateSpaceInternalResponse, bodyOf(response));
    expectAccessMembers(created);
    return created;
  }

  /**
   * Creates a list in a space and checks the answer against the contract.
   *
   * @param actor - Who creates.
   * @param spaceId - The space.
   * @param body - The list.
   * @returns The list.
   */
  async function createList(actor: Person, spaceId: string, body: object): Promise<ListBody> {
    const response = await send('post', `/internal/v1/spaces/${spaceId}/lists`, actor, { body });
    expect(response.status, response.text).toBe(201);
    const list = conforms(CreateListInternalResponse, bodyOf(response));
    expectAccessMembers(list);
    return list;
  }

  /**
   * Creates a task in a list and checks the answer against the contract.
   *
   * @param actor - Who creates.
   * @param listId - The list.
   * @param body - The task.
   * @param organizationId - Organization of the actor, Atelier Nord by default.
   * @returns The task.
   */
  async function createTask(
    actor: Person,
    listId: string,
    body: object,
    organizationId: string = atelierNordId,
  ): Promise<TaskBody> {
    const response = await send('post', `/internal/v1/lists/${listId}/tasks`, actor, {
      body,
      organizationId,
    });
    expect(response.status, response.text).toBe(201);
    return conforms(CreateTaskInternalResponse, bodyOf(response));
  }

  /**
   * Creates a subtask under a task and checks the answer against the contract.
   *
   * @param parentKey - The parent.
   * @param body - The subtask.
   * @param actor - Who creates, Camille by default.
   * @returns The subtask.
   */
  async function createSubtask(
    parentKey: string,
    body: object,
    actor: Person = camille,
  ): Promise<TaskBody> {
    const response = await send('post', `/internal/v1/tasks/${parentKey}/subtasks`, actor, {
      body,
    });
    expect(response.status, response.text).toBe(201);
    return conforms(CreateSubtaskInternalResponse, bodyOf(response));
  }

  /**
   * Changes a task and checks `200` and the answer against the contract.
   *
   * @param key - The task.
   * @param body - The patch.
   * @param actor - Who changes it, Camille by default.
   * @returns The task.
   */
  async function patchTask(key: string, body: object, actor: Person = camille): Promise<TaskBody> {
    const response = await send('patch', `/internal/v1/tasks/${key}`, actor, { body });
    expect(response.status, response.text).toBe(200);
    return conforms(UpdateTaskInternalResponse, bodyOf(response));
  }

  /**
   * Reads a task by its key.
   *
   * @param key - The task.
   * @param actor - Who reads, Camille by default.
   * @returns The task.
   */
  async function readTask(key: string, actor: Person = camille): Promise<TaskBody> {
    return read(GetTaskInternalResponse, `/internal/v1/tasks/${key}`, actor);
  }

  /**
   * Reads a list by its id.
   *
   * @param listId - The list.
   * @param actor - Who reads, Camille by default.
   * @returns The list.
   */
  async function readList(listId: string, actor: Person = camille): Promise<ListBody> {
    return read(GetListInternalResponse, `/internal/v1/lists/${listId}`, actor);
  }

  /**
   * Gives or changes a grant and checks `200` and the answer against the contract.
   *
   * @param actor - Who gives it.
   * @param resource - `spaces` or `lists`.
   * @param resourceId - The space or the list.
   * @param userId - The person given access.
   * @param role - The role.
   */
  async function grant(
    actor: Person,
    resource: 'spaces' | 'lists',
    resourceId: string,
    userId: string,
    role: Role,
  ): Promise<void> {
    const response = await send(
      'put',
      `/internal/v1/${resource}/${resourceId}/grants/${userId}`,
      actor,
      { body: { role } },
    );
    expect(response.status, response.text).toBe(200);
    conforms(
      resource === 'spaces' ? SetSpaceGrantInternalResponse : SetListGrantInternalResponse,
      bodyOf(response),
    );
  }

  /**
   * Calls the archive or the restoration of a list or a task.
   *
   * @param action - `archive` or `unarchive`.
   * @param resource - `lists` or `tasks`.
   * @param id - The id of the list or the key of the task.
   * @param actor - Who acts.
   * @param options - Headers and organization; the body is the empty object unless given.
   * @returns The response.
   */
  async function act(
    action: 'archive' | 'unarchive',
    resource: 'lists' | 'tasks',
    id: string,
    actor: Person,
    options: SendOptions = {},
  ): Promise<request.Response> {
    return send('post', `/internal/v1/${resource}/${id}/${action}`, actor, {
      body: {},
      ...options,
    });
  }

  /**
   * Checks an answer of an archive or a restoration of a list: `200`, the contract, the access of
   * the caller and the `ETag` of its version.
   *
   * @param response - The response.
   * @param schema - The validator of the route.
   * @returns The list.
   */
  function listAnswer(
    response: request.Response,
    schema: typeof ArchiveListInternalResponse | typeof UnarchiveListInternalResponse,
  ): ListBody {
    expect(response.status, response.text).toBe(200);
    const list = conforms(schema, bodyOf(response));
    expectAccessMembers(list);
    expect(response.headers.etag).toBe(etagOf(list.version));
    return list;
  }

  /**
   * Checks an answer of an archive or a restoration of a task: `200`, the contract and the `ETag`
   * of its version.
   *
   * @param response - The response.
   * @param schema - The validator of the route.
   * @returns The task.
   */
  function taskAnswer(
    response: request.Response,
    schema: typeof ArchiveTaskInternalResponse | typeof UnarchiveTaskInternalResponse,
  ): TaskBody {
    expect(response.status, response.text).toBe(200);
    const task = conforms(schema, bodyOf(response));
    expect(response.headers.etag).toBe(etagOf(task.version));
    return task;
  }

  /**
   * Archives a list and checks the answer.
   *
   * @param listId - The list.
   * @param actor - Who archives it, Camille by default.
   * @returns The list, archived.
   */
  async function archiveList(listId: string, actor: Person = camille): Promise<ListBody> {
    return listAnswer(await act('archive', 'lists', listId, actor), ArchiveListInternalResponse);
  }

  /**
   * Restores a list and checks the answer.
   *
   * @param listId - The list.
   * @param actor - Who restores it, Camille by default.
   * @returns The list, back in its space.
   */
  async function unarchiveList(listId: string, actor: Person = camille): Promise<ListBody> {
    return listAnswer(
      await act('unarchive', 'lists', listId, actor),
      UnarchiveListInternalResponse,
    );
  }

  /**
   * Archives a task and checks the answer.
   *
   * @param key - The task.
   * @param actor - Who archives it, Camille by default.
   * @returns The task, archived.
   */
  async function archiveTask(key: string, actor: Person = camille): Promise<TaskBody> {
    return taskAnswer(await act('archive', 'tasks', key, actor), ArchiveTaskInternalResponse);
  }

  /**
   * Restores the archive of a task and checks the answer.
   *
   * @param key - The task.
   * @param actor - Who restores it, Camille by default.
   * @returns The root of the archive, back in its list.
   */
  async function unarchiveTask(key: string, actor: Person = camille): Promise<TaskBody> {
    return taskAnswer(await act('unarchive', 'tasks', key, actor), UnarchiveTaskInternalResponse);
  }

  /**
   * Names the lists of a space a member sees, in the order of the sidebar.
   *
   * @param spaceId - The space.
   * @param actor - Who reads, Camille by default.
   * @returns The names of the first page of 100.
   */
  async function listNamesOf(spaceId: string, actor: Person = camille): Promise<string[]> {
    const page = await read(
      ListListsInternalResponse,
      `/internal/v1/spaces/${spaceId}/lists`,
      actor,
      {
        limit: 100,
      },
    );
    expectNothingArchived(page);
    return page.items.map((list) => list.name);
  }

  /**
   * Reads the overview of a space.
   *
   * @param spaceId - The space.
   * @param actor - Who reads, Camille by default.
   * @returns The overview, first page of 100.
   */
  async function overviewOf(spaceId: string, actor: Person = camille): Promise<OverviewBody> {
    return read(
      GetSpaceOverviewInternalResponse,
      `/internal/v1/spaces/${spaceId}/overview`,
      actor,
      {
        today,
        limit: 100,
      },
    );
  }

  /**
   * Reads the task part of "Accueil".
   *
   * @param actor - Who reads.
   * @param on - The date of the caller.
   * @returns "Accueil".
   */
  async function homeOf(actor: Person, on: string = today): Promise<HomeBody> {
    return read(GetHomeInternalResponse, `/internal/v1/users/${actor.userId}/home`, actor, {
      today: on,
    });
  }

  /**
   * Reads the open tasks of "Mes tâches".
   *
   * @param actor - Who reads.
   * @returns The first page of 100 with the counts of both tabs.
   */
  async function myTasksOf(actor: Person): Promise<MyTasksBody> {
    return read(ListMyTasksInternalResponse, `/internal/v1/users/${actor.userId}/tasks`, actor, {
      state: 'open',
      limit: 100,
    });
  }

  /**
   * Names the labels a member sees.
   *
   * @param actor - Who reads.
   * @returns The names of the first page of 100.
   */
  async function labelsOf(actor: Person): Promise<string[]> {
    const page = await read(ListLabelsInternalResponse, '/internal/v1/labels', actor, {
      limit: 100,
    });
    return page.items.map((label) => label.name);
  }

  /**
   * Reads the tasks of a list.
   *
   * @param listId - The list.
   * @param level - `roots` or `all`.
   * @returns The keys of the first page of 100, sorted, and the total.
   */
  async function tasksOf(
    listId: string,
    level: 'roots' | 'all' = 'roots',
  ): Promise<{ readonly keys: string[]; readonly total: number }> {
    const page = await read(
      ListTasksInternalResponse,
      `/internal/v1/lists/${listId}/tasks`,
      camille,
      {
        level,
        limit: 100,
      },
    );
    return { keys: page.items.map((task) => task.key).sort(), total: page.total };
  }

  /**
   * Reads the activity of a list.
   *
   * @param listId - The list.
   * @returns The first page of 100.
   */
  async function listActivityOf(
    listId: string,
  ): Promise<z.output<typeof ListListActivityInternalResponse>> {
    return read(
      ListListActivityInternalResponse,
      `/internal/v1/lists/${listId}/activity`,
      camille,
      {
        limit: 100,
      },
    );
  }

  /**
   * Counts the activity of a task.
   *
   * @param key - The task.
   * @returns The total of its activity.
   */
  async function taskActivityTotal(key: string): Promise<number> {
    const page = await read(
      ListTaskActivityInternalResponse,
      `/internal/v1/tasks/${key}/activity`,
      camille,
      {
        limit: 100,
      },
    );
    return page.total;
  }

  /**
   * Reads the subtasks of a task.
   *
   * @param key - The task.
   * @returns The keys of the first page of 100 and the total.
   */
  async function subtasksOf(
    key: string,
  ): Promise<{ readonly keys: string[]; readonly total: number }> {
    const page = await read(
      ListSubtasksInternalResponse,
      `/internal/v1/tasks/${key}/subtasks`,
      camille,
      {
        limit: 100,
      },
    );
    return { keys: page.items.map((task) => task.key), total: page.total };
  }

  /**
   * Reads the detail of a task.
   *
   * @param key - The task.
   * @returns The detail.
   */
  async function detailOf(key: string): Promise<z.output<typeof GetTaskDetailInternalResponse>> {
    return read(GetTaskDetailInternalResponse, `/internal/v1/tasks/${key}/detail`, camille);
  }

  /**
   * Reads a page of the tab "Listes" of "Archives".
   *
   * @param actor - Who reads.
   * @param query - Cursor and limit; 100 by default.
   * @returns The page.
   */
  async function archivedListsOf(
    actor: Person,
    query: Query = { limit: 100 },
  ): Promise<ArchivedListPageBody> {
    return read(ListArchivedListsInternalResponse, '/internal/v1/archives/lists', actor, query);
  }

  /**
   * Reads a page of the tab "Tâches" of "Archives".
   *
   * @param actor - Who reads.
   * @param query - Cursor and limit; 100 by default.
   * @returns The page.
   */
  async function archivedTasksOf(
    actor: Person,
    query: Query = { limit: 100 },
  ): Promise<ArchivedTaskPageBody> {
    return read(ListArchivedTasksInternalResponse, '/internal/v1/archives/tasks', actor, query);
  }

  /**
   * Walks every page of a tab of "Archives", checking the total of each page.
   *
   * @param page - Reads one page from a cursor.
   * @param total - The total every page must carry.
   * @returns The ids of the items, in the order of the pages.
   */
  async function walkPages(
    page: (cursor: string | null) => Promise<{
      readonly ids: readonly string[];
      readonly nextCursor: string | null;
      readonly total: number;
    }>,
    total: number,
  ): Promise<string[]> {
    const walked: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const current = await page(cursor);
      expect(current.total).toBe(total);
      walked.push(...current.ids);
      cursor = current.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 50);
    expect(cursor).toBeNull();
    return walked;
  }

  /**
   * Runs work in the tenant transaction of an organization, as the module of a request would, as
   * the `task_app` role of the application.
   *
   * @param organizationId - Organization of the context.
   * @param work - Work that receives the transaction.
   * @returns What the work returns.
   */
  async function inTenant<TResult>(
    organizationId: string,
    work: (client: TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    const tenant = service().get(TenantTransactionRunner);
    return runWithOrganizationContext(contextOf(organizationId), () =>
      tenant.run((tx) => work(tx.client)),
    );
  }

  /**
   * Lists the account ids the copy holds as active members of an organization.
   *
   * @param organizationId - The organization.
   * @returns The accounts, sorted.
   */
  async function activeMembers(organizationId: string): Promise<string[]> {
    const rows = await asSystem<{ readonly user_id: string }>(
      `select user_id from organization_members
        where organization_id = $1 and removed_at is null order by user_id`,
      [organizationId],
    );
    return rows.map((row) => row.user_id);
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

    vi.stubEnv(
      'MIGRATION_DATABASE_URL',
      `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task`,
    );
    vi.resetModules();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await import('../src/migrate.js');
    } finally {
      log.mockRestore();
    }
    migrator = new pg.Pool({
      connectionString: `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task`,
      max: 3,
    });

    vi.stubEnv('PORT', '3013');
    vi.stubEnv('LOG_PRETTY', 'false');
    vi.stubEnv('DATABASE_URL', `postgres://task_app:task_app@127.0.0.1:${postgresPort}/task`);
    vi.stubEnv('NATS_URL', `nats://127.0.0.1:${natsPort}`);
    vi.stubEnv('NATS_USER', 'task');
    vi.stubEnv('NATS_PASSWORD', 'task');
    vi.stubEnv('INTERNAL_TOKEN_AUDIENCE', 'task-service');
    vi.stubEnv(
      'INTERNAL_TOKEN_TRUSTED_ISSUERS',
      JSON.stringify({
        'api-gateway': [apiGateway.publicJwk],
        'realtime-gateway': [realtimeGateway.publicJwk],
      }),
    );

    telemetry = startTelemetry({ service: 'task-service', version: '0.0.0-test' });
    // As main.ts: the configuration is read inside the start-up, never when a module is imported.
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
    signers.set(
      'api-gateway',
      await InternalTokenSigner.create({
        issuer: 'api-gateway',
        privateJwk: apiGateway.privateJwk,
      }),
    );
    signers.set(
      'realtime-gateway',
      await InternalTokenSigner.create({
        issuer: 'realtime-gateway',
        privateJwk: realtimeGateway.privateJwk,
      }),
    );

    // The people of Atelier Nord join as organization-service would announce them, and the second
    // organization gets its owner.
    join(atelierNordId, camille, 'owner');
    join(atelierNordId, ines, 'admin');
    join(atelierNordId, hugo, 'member');
    join(atelierNordId, lea, 'member');
    join(atelierNordId, nadia, 'guest');
    join(atelierNordId, rose, 'guest');
    join(atelierNordId, chloe, 'guest');
    join(atelierNordId, noe, 'guest');
    join(atelierNordId, mathis, 'guest');
    join(atelierNordId, lucie, 'guest');
    join(atelierDeltaId, solene, 'owner');
    await vi.waitFor(
      async () => {
        expect(await activeMembers(atelierNordId)).toEqual(
          [camille, ines, hugo, lea, nadia, rose, chloe, noe, mathis, lucie]
            .map((person) => person.userId)
            .sort(),
        );
        expect(await activeMembers(atelierDeltaId)).toEqual([solene.userId]);
      },
      { timeout: 60_000, interval: 500 },
    );

    // "Produit" of Camille, the first space of the organization, with Sprint 13, Sprint 14 and the
    // backlog; "Recherche", the private space of Hugo, which Léa sees with `view`.
    produit = await createSpace(camille, {
      name: 'Produit',
      prefix: 'CAD',
      icon: 'rocket',
      color: 'violet',
    });
    sprint13 = await createList(camille, produit.space.id, {
      name: 'Sprint 13',
      icon: 'lightning',
      color: 'violet',
      sprint: {
        startDate: '2026-10-20',
        endDate: '2026-11-02',
        goal: 'Livrer les invitations par lien.',
      },
    });
    sprint14 = await createList(camille, produit.space.id, {
      name: 'Sprint 14',
      icon: 'lightning',
      color: 'violet',
      sprint: {
        startDate: '2026-11-03',
        endDate: '2026-11-17',
        goal: 'Livrer la connexion SSO et la page des quotas d’organisation.',
      },
    });
    backlog = await createList(camille, produit.space.id, { name: 'Backlog produit' });
    gridUpdate = await createTask(camille, sprint13.id, {
      name: 'Mettre à jour la grille tarifaire',
      priority: 'haute',
      assigneeIds: [lea.userId],
      dueDate: '2026-11-10',
      labels: ['Tarifs'],
    });
    cookieBanner = await createTask(camille, sprint13.id, {
      name: 'Bandeau cookies',
      status: 'done',
      subtasks: [{ name: 'Texte du bandeau' }],
    });
    recherche = await createSpace(hugo, {
      name: 'Recherche',
      prefix: 'RCH',
      visibility: 'private',
    });
    entretiens = await createList(hugo, recherche.space.id, { name: 'Entretiens' });
    synthese = await createList(hugo, recherche.space.id, { name: 'Synthèse' });
    await grant(hugo, 'spaces', recherche.space.id, lea.userId, 'view');
    interviewGuide = await createTask(hugo, entretiens.id, { name: 'Guide d’entretien' });
  }, 240_000);

  afterAll(async () => {
    try {
      await app?.close();
      await migrator.end();
      await telemetry?.shutdown();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  });

  describe('without an archive, every Task and TaskList answers archivedAt and archivedBy null', () => {
    it('answers every TaskList with archivedAt and archivedBy null: a creation, a read, a patch, the lists of a space, the counters, the overview and "Accueil"', async () => {
      const answers: unknown[] = [produit, sprint13, sprint14, backlog];
      answers.push(await readList(sprint14.id));
      const patched = await send('patch', `/internal/v1/lists/${backlog.id}`, camille, {
        body: { color: 'azur' },
      });
      expect(patched.status, patched.text).toBe(200);
      answers.push(conforms(UpdateListInternalResponse, bodyOf(patched)));
      answers.push(
        await read(
          ListListsInternalResponse,
          `/internal/v1/spaces/${produit.space.id}/lists`,
          camille,
        ),
      );
      answers.push(
        await read(
          GetListCountsInternalResponse,
          `/internal/v1/lists/${sprint13.id}/counts`,
          camille,
          {
            today,
          },
        ),
      );
      answers.push(await overviewOf(produit.space.id));
      answers.push(await homeOf(camille, inSprint13));
      answers.push(await homeOf(lea));

      const met = expectNothingArchived(answers);
      expect(met.lists).toBeGreaterThanOrEqual(20);
      expect(met.summaries).toBeGreaterThanOrEqual(1);
    });

    it('answers every Task with archivedAt and archivedBy null: a creation, a read, a patch, a subtask, an assignee, a label, a checklist item and the detail', async () => {
      const sso = await createTask(camille, sprint14.id, {
        name: 'Refondre l’écran de connexion SSO',
        priority: 'urgente',
      });
      const answers: unknown[] = [sso, gridUpdate, cookieBanner, interviewGuide];
      answers.push(await readTask(sso.key));
      answers.push(await patchTask(sso.key, { name: 'Refondre l’écran de connexion SSO (v2)' }));
      answers.push(await createSubtask(sso.key, { name: 'Maquette validée' }));
      const assigned = await send(
        'put',
        `/internal/v1/tasks/${sso.key}/assignees/${hugo.userId}`,
        camille,
        { body: {} },
      );
      expect(assigned.status, assigned.text).toBe(200);
      answers.push(conforms(AssignTaskInternalResponse, bodyOf(assigned)));
      const labelled = await send('post', `/internal/v1/tasks/${sso.key}/labels/add`, camille, {
        body: { name: 'Sécurité' },
      });
      expect(labelled.status, labelled.text).toBe(200);
      answers.push(conforms(AddTaskLabelInternalResponse, bodyOf(labelled)));
      const item = await send('post', `/internal/v1/tasks/${sso.key}/checklist-items`, camille, {
        body: { text: 'Relire les écrans' },
      });
      expect(item.status, item.text).toBe(201);
      answers.push(conforms(AddChecklistItemInternalResponse, bodyOf(item)));
      answers.push(await detailOf(sso.key));
      answers.push(await myTasksOf(lea));

      const met = expectNothingArchived(answers);
      expect(met.tasks).toBeGreaterThanOrEqual(11);
      expect(met.summaries).toBeGreaterThanOrEqual(2);
      expect(met.lists).toBeGreaterThanOrEqual(1);
    });
  });

  // What the archive of Sprint 13 is compared with: read before it, in the first test below.
  let overviewBefore: OverviewBody;
  let homeInSprint13Before: HomeBody;
  let leaMyTasksBefore: MyTasksBody;
  let leaHomeBefore: HomeBody;
  let leaLabelsBefore: string[];

  describe('archiving a list hides it from its space and keeps it readable by its id', () => {
    it('archives Sprint 13 for Camille: 200 with archivedAt, archivedBy, the next version and its ETag, and list.archived.v1 at the same instant', async () => {
      overviewBefore = await overviewOf(produit.space.id);
      homeInSprint13Before = await homeOf(camille, inSprint13);
      leaMyTasksBefore = await myTasksOf(lea);
      leaHomeBefore = await homeOf(lea);
      leaLabelsBefore = await labelsOf(lea);
      const before = await readList(sprint13.id);
      const eventsBefore = (await outboxOf('listId', sprint13.id)).length;
      const taskEventsBefore = (await outboxOf('key', gridUpdate.key)).length;

      const archived = await archiveList(sprint13.id);

      expect(archived).toMatchObject({
        id: sprint13.id,
        name: 'Sprint 13',
        version: before.version + 1,
        archivedBy: { type: 'user', id: camille.userId },
        callerRole: 'edit',
        organizationAccess: true,
      });
      expect(archived.archivedAt).not.toBeNull();
      expect(await readList(sprint13.id)).toEqual(archived);

      const events = await outboxSince('listId', sprint13.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual(['list.archived.v1']);
      const payload = conforms(taskEventSchemas['list.archived.v1'], events[0]?.payload);
      expect(payload).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: camille.userId },
        version: archived.version,
        listId: sprint13.id,
        spaceId: produit.space.id,
        name: 'Sprint 13',
        icon: 'lightning',
        color: 'violet',
        sprint: {
          startDate: '2026-10-20',
          endDate: '2026-11-02',
          goal: 'Livrer les invitations par lien.',
        },
        organizationAccess: true,
      });
      // The same instant: the clock of the transaction truncates `now()` as the outbox does.
      expect(archived.archivedAt).toBe(payload.occurredAt);

      // Its tasks do not change and emit nothing.
      expect(await readTask(gridUpdate.key)).toEqual(gridUpdate);
      expect(await outboxOf('key', gridUpdate.key)).toHaveLength(taskEventsBefore);
    });

    it('answers an archived list again with 200 and the same version, and emits nothing', async () => {
      const before = await readList(sprint13.id);
      const total = await outboxTotal();

      const again = await archiveList(sprint13.id);

      expect(again).toEqual(before);
      expect(await outboxTotal()).toBe(total);
    });

    it('answers 404 list.not-found for an unknown list and for a list the actor does not see', async () => {
      for (const [actor, listId] of [
        [camille, randomUUID()],
        [camille, entretiens.id],
        [chloe, sprint14.id],
      ] as const) {
        expectProblem(await act('archive', 'lists', listId, actor), 404, 'list.not-found');
        expectProblem(await act('unarchive', 'lists', listId, actor), 404, 'list.not-found');
      }
    });

    it('refuses a view grantee with 403 access.role-insufficient and their role, and changes nothing', async () => {
      const total = await outboxTotal();

      expectProblem(
        await act('archive', 'lists', entretiens.id, lea),
        403,
        'access.role-insufficient',
        {
          role: 'view',
          requiredRole: 'edit',
        },
      );

      expect(await readList(entretiens.id, hugo)).toMatchObject({
        version: entretiens.version,
        archivedAt: null,
        archivedBy: null,
      });
      expect(await outboxTotal()).toBe(total);
    });

    it('checks If-Match after the role: 404, then 403, then 412 with the version, and archives with the right one', async () => {
      const version = (await readList(synthese.id, hugo)).version;

      expectProblem(
        await act('archive', 'lists', synthese.id, camille, { headers: stale }),
        404,
        'list.not-found',
      );
      expectProblem(
        await act('archive', 'lists', synthese.id, lea, { headers: stale }),
        403,
        'access.role-insufficient',
        { role: 'view', requiredRole: 'edit' },
      );
      expectProblem(
        await act('archive', 'lists', synthese.id, hugo, { headers: stale }),
        412,
        'request.version-mismatch',
        { version },
      );
      expect((await readList(synthese.id, hugo)).archivedAt).toBeNull();

      const archived = listAnswer(
        await act('archive', 'lists', synthese.id, hugo, {
          headers: { 'If-Match': etagOf(version) },
        }),
        ArchiveListInternalResponse,
      );
      expect(archived).toMatchObject({
        version: version + 1,
        archivedBy: { type: 'user', id: hugo.userId },
      });
    });

    it('refuses a body that is not an object with 400 request.invalid, and changes nothing', async () => {
      const version = (await readList(backlog.id)).version;
      const path = `/internal/v1/lists/${backlog.id}/archive`;

      expectProblem(await send('post', path, camille), 400, 'request.invalid');
      expectProblem(await send('post', path, camille, { body: [] }), 400, 'request.invalid');
      expectProblem(await send('post', path, camille, { text: 'archive' }), 400, 'request.invalid');
      expectProblem(
        await send('post', `/internal/v1/tasks/${gridUpdate.key}/archive`, camille, { body: [] }),
        400,
        'request.invalid',
      );

      expect(await readList(backlog.id)).toMatchObject({ version, archivedAt: null });
      expect((await readTask(gridUpdate.key)).archivedAt).toBeNull();
    });
  });

  describe('an archived list leaves its space, the overview and "Accueil", and keeps the rest', () => {
    it('leaves Sprint 13 out of the lists of Produit, of the overview (lists, listCount, taskCount) and of the sprints and lists of "Accueil"', async () => {
      const counts = await read(
        GetListCountsInternalResponse,
        `/internal/v1/lists/${sprint13.id}/counts`,
        camille,
        {
          today,
        },
      );
      expect(counts.counts.total).toBe(2);

      expect(await listNamesOf(produit.space.id)).toEqual([
        'Première liste',
        'Sprint 14',
        'Backlog produit',
      ]);
      const overview = await overviewOf(produit.space.id);
      expect(overview.items.map((item) => item.list.name)).toEqual(
        overviewBefore.items.map((item) => item.list.name).filter((name) => name !== 'Sprint 13'),
      );
      expect(overview.listCount).toBe(overviewBefore.listCount - 1);
      expect(overview.taskCount).toBe(overviewBefore.taskCount - counts.counts.total);

      const home = await homeOf(camille, inSprint13);
      expect(homeInSprint13Before.sprints.map((item) => item.list.id)).toContain(sprint13.id);
      expect(homeInSprint13Before.lists.map((item) => item.list.id)).toContain(sprint13.id);
      expect(home.sprints.map((item) => item.list.id)).not.toContain(sprint13.id);
      expect(
        home.lists
          .filter((item) => item.list.spaceId === produit.space.id)
          .map((item) => item.list.name),
      ).toEqual(['Première liste', 'Sprint 14', 'Backlog produit']);
    });

    it('keeps its tasks in "Mes tâches", the stats and priorities of "Accueil" and the labels', async () => {
      expect(await myTasksOf(lea)).toEqual(leaMyTasksBefore);
      expect(leaMyTasksBefore.items.map((task) => task.key)).toContain(gridUpdate.key);
      const home = await homeOf(lea);
      expect(home.stats).toEqual(leaHomeBefore.stats);
      expect(home.priorities).toEqual(leaHomeBefore.priorities);
      expect(home.priorities.map((task) => task.key)).toContain(gridUpdate.key);
      expect(await labelsOf(lea)).toEqual(leaLabelsBefore);
      expect(leaLabelsBefore).toContain('Tarifs');
    });

    it('keeps Sprint 13 readable by its id with its archive, with its tasks, counters and activity, and its tasks readable and changeable by key', async () => {
      const list = await readList(sprint13.id);
      expect(list.archivedAt).not.toBeNull();
      expect(list.archivedBy).toEqual({ type: 'user', id: camille.userId });

      expect(await tasksOf(sprint13.id)).toEqual({
        keys: [gridUpdate.key, cookieBanner.key].sort(),
        total: 2,
      });
      expect((await tasksOf(sprint13.id, 'all')).total).toBe(3);
      const counts = await read(
        GetListCountsInternalResponse,
        `/internal/v1/lists/${sprint13.id}/counts`,
        camille,
        {
          today,
        },
      );
      expect(counts.list).toEqual(list);
      expect(counts.counts).toMatchObject({ total: 2, done: 1 });
      const groups = await read(
        CountTaskGroupsInternalResponse,
        `/internal/v1/lists/${sprint13.id}/task-groups`,
        camille,
        { groupBy: 'status' },
      );
      expect(groups.total).toBe(2);
      const activity = await listActivityOf(sprint13.id);
      expect(activity.total).toBeGreaterThanOrEqual(3);
      expect(activity.items.map((entry) => entry.task.key)).toContain(gridUpdate.key);

      expect(await readTask(gridUpdate.key)).toEqual(gridUpdate);
      const changed = await patchTask(gridUpdate.key, { priority: 'urgente' });
      expect(changed).toMatchObject({ priority: 'urgente', version: gridUpdate.version + 1 });
      gridUpdate = changed;
    });

    it('lets Sprint 13 be patched and shared while archived, and answers its role to the realtime gateway', async () => {
      const before = await readList(sprint13.id);

      const patched = await send('patch', `/internal/v1/lists/${sprint13.id}`, camille, {
        body: { color: 'indigo' },
      });
      expect(patched.status, patched.text).toBe(200);
      expect(conforms(UpdateListInternalResponse, bodyOf(patched))).toMatchObject({
        color: 'indigo',
        version: before.version + 1,
        archivedAt: before.archivedAt,
        archivedBy: before.archivedBy,
      });

      await grant(camille, 'lists', sprint13.id, rose.userId, 'view');
      const grants = await read(
        ListListGrantsInternalResponse,
        `/internal/v1/lists/${sprint13.id}/grants`,
        camille,
      );
      expect(grants.items.map((item) => item.userId)).toEqual([rose.userId]);
      expect(await readList(sprint13.id, rose)).toMatchObject({
        callerRole: 'view',
        archivedAt: before.archivedAt,
      });

      const realtime = { issuer: 'realtime-gateway' } as const;
      for (const [viewer, role] of [
        [camille, 'edit'],
        [rose, 'view'],
      ] as const) {
        const response = await send(
          'get',
          `/internal/v1/lists/${sprint13.id}/access`,
          viewer,
          realtime,
        );
        expect(response.status, response.text).toBe(200);
        expect(conforms(CheckListAccessInternalResponse, bodyOf(response))).toEqual({
          role,
          spaceId: produit.space.id,
          listId: sprint13.id,
          taskKey: null,
        });
      }
    });

    it('still takes new tasks: POST /lists/{id}/tasks creates a live task in an archived list', async () => {
      const created = await createTask(camille, sprint13.id, {
        name: 'Nouvelle grille des offres',
      });

      expect(created).toMatchObject({ listId: sprint13.id, archivedAt: null, archivedBy: null });
      expect((await tasksOf(sprint13.id)).keys).toContain(created.key);
      expect((await readList(sprint13.id)).archivedAt).not.toBeNull();
    });
  });

  describe('restoring a list puts it back at the end of its space', () => {
    it('restores Sprint 13: 200 with archivedAt null and the next version, list.unarchived.v1, and the list last in Produit and in "Accueil"', async () => {
      const before = await readList(sprint13.id);
      const eventsBefore = (await outboxOf('listId', sprint13.id)).length;

      const restored = await unarchiveList(sprint13.id);

      expect(restored).toMatchObject({
        id: sprint13.id,
        version: before.version + 1,
        archivedAt: null,
        archivedBy: null,
        callerRole: 'edit',
      });
      const events = await outboxSince('listId', sprint13.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual(['list.unarchived.v1']);
      expect(conforms(taskEventSchemas['list.unarchived.v1'], events[0]?.payload)).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: camille.userId },
        version: restored.version,
        listId: sprint13.id,
        spaceId: produit.space.id,
        name: 'Sprint 13',
        color: 'indigo',
        organizationAccess: true,
      });

      const order = ['Première liste', 'Sprint 14', 'Backlog produit', 'Sprint 13'];
      expect(await listNamesOf(produit.space.id)).toEqual(order);
      const home = await homeOf(camille, inSprint13);
      expect(
        home.lists
          .filter((item) => item.list.spaceId === produit.space.id)
          .map((item) => item.list.name),
      ).toEqual(order);
      expect(home.sprints.map((item) => item.list.id)).toContain(sprint13.id);
      expect((await overviewOf(produit.space.id)).listCount).toBe(overviewBefore.listCount);
    });

    it('answers a list that is not archived with 200 and the same version, and emits nothing', async () => {
      const before = await readList(sprint13.id);
      const total = await outboxTotal();

      expect(await unarchiveList(sprint13.id)).toEqual(before);
      expect(await outboxTotal()).toBe(total);
    });

    it('refuses a restoration as an archive: 404 for a list the actor does not see, 403 for a view grantee, then 412, and restores with the right version', async () => {
      const version = (await readList(synthese.id, hugo)).version;

      expectProblem(
        await act('unarchive', 'lists', synthese.id, camille, { headers: stale }),
        404,
        'list.not-found',
      );
      expectProblem(
        await act('unarchive', 'lists', synthese.id, lea, { headers: stale }),
        403,
        'access.role-insufficient',
        { role: 'view', requiredRole: 'edit' },
      );
      expectProblem(
        await act('unarchive', 'lists', synthese.id, hugo, { headers: stale }),
        412,
        'request.version-mismatch',
        { version },
      );
      expect((await readList(synthese.id, hugo)).archivedAt).not.toBeNull();

      const restored = listAnswer(
        await act('unarchive', 'lists', synthese.id, hugo, {
          headers: { 'If-Match': etagOf(version) },
        }),
        UnarchiveListInternalResponse,
      );
      expect(restored).toMatchObject({ version: version + 1, archivedAt: null });
      expect(await listNamesOf(recherche.space.id, hugo)).toEqual([
        'Première liste',
        'Entretiens',
        'Synthèse',
      ]);
    });
  });

  // The tree of « Ancienne page des tarifs » in "Refonte du site" (Produit): the root, two
  // subtasks, a grandchild and a subtask archived on its own before the root.
  let refonte: ListBody;
  let maintenance: ListBody;
  let oldPricing: TaskBody;
  let oldGrid: TaskBody;
  let redirect: TaskBody;
  let pdfs: TaskBody;
  let exportShots: TaskBody;
  let pricingItemId = '';

  describe('archiving a task archives its live subtree as one archive', () => {
    it('archives « Ancienne page des tarifs » with its live subtasks at every level, whatever their status: one instant, actor and next version each, and task.archived.v1 root first then by depth', async () => {
      refonte = await createList(camille, produit.space.id, { name: 'Refonte du site' });
      maintenance = await createList(camille, produit.space.id, { name: 'Maintenance du site' });
      oldPricing = await createTask(camille, refonte.id, {
        name: 'Ancienne page des tarifs',
        status: 'done',
        priority: 'basse',
        assigneeIds: [hugo.userId],
        labels: ['Front'],
        estimateMinutes: 120,
      });
      oldGrid = await createSubtask(oldPricing.key, { name: 'Captures de l’ancienne grille' });
      redirect = await createSubtask(oldPricing.key, {
        name: 'Rediriger l’ancienne URL',
        status: 'done',
      });
      pdfs = await createSubtask(oldPricing.key, { name: 'Archiver les PDF de la grille' });
      exportShots = await createSubtask(oldGrid.key, {
        name: 'Exporter les captures',
        status: 'blocked',
      });
      const item = await send(
        'post',
        `/internal/v1/tasks/${oldPricing.key}/checklist-items`,
        camille,
        {
          body: { text: 'Vérifier les liens' },
        },
      );
      expect(item.status, item.text).toBe(201);
      pricingItemId =
        conforms(AddChecklistItemInternalResponse, bodyOf(item)).checklist[0]?.id ?? '';
      pdfs = await archiveTask(pdfs.key);
      expect(pdfs.archivedAt).not.toBeNull();

      const members = [oldPricing.key, oldGrid.key, redirect.key, exportShots.key];
      const before = new Map<string, TaskBody>();
      for (const key of [...members, pdfs.key]) {
        before.set(key, await readTask(key));
      }
      const activityBefore = await taskActivityTotal(oldPricing.key);
      const eventsBefore = (await outboxOf('rootKey', oldPricing.key)).length;
      const pdfEventsBefore = (await outboxOf('key', pdfs.key)).length;

      const archived = await archiveTask(oldPricing.key);

      expect(archived).toMatchObject({
        key: oldPricing.key,
        status: 'done',
        version: (before.get(oldPricing.key)?.version ?? 0) + 1,
        archivedBy: { type: 'user', id: camille.userId },
        subtaskCounts: { total: 2, closed: 1 },
      });
      expect(archived.archivedAt).not.toBeNull();
      for (const key of members) {
        const member = await readTask(key);
        expect(member, key).toEqual({
          ...before.get(key),
          version: (before.get(key)?.version ?? 0) + 1,
          updatedAt: member.updatedAt,
          archivedAt: archived.archivedAt,
          archivedBy: { type: 'user', id: camille.userId },
        });
        expect(instantOf(member.updatedAt)).toBe(instantOf(archived.archivedAt));
      }
      // The subtask archived before keeps its own archive.
      expect(await readTask(pdfs.key)).toEqual(before.get(pdfs.key));
      expect(await outboxOf('key', pdfs.key)).toHaveLength(pdfEventsBefore);
      const roots = await archiveRootsOf(
        await Promise.all([...members, pdfs.key].map((key) => taskIdOf(key))),
      );
      const rootId = await taskIdOf(oldPricing.key);
      for (const key of members) {
        expect(roots.get(await taskIdOf(key)), key).toBe(rootId);
      }
      expect(roots.get(await taskIdOf(pdfs.key))).toBe(await taskIdOf(pdfs.key));

      const events = await outboxSince('rootKey', oldPricing.key, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual(
        members.map(() => 'task.archived.v1'),
      );
      const payloads = events.map((event) =>
        conforms(taskEventSchemas['task.archived.v1'], event.payload),
      );
      expect(payloads.map((payload) => payload.key)).toEqual([
        oldPricing.key,
        oldGrid.key,
        redirect.key,
        exportShots.key,
      ]);
      for (const payload of payloads) {
        expect(payload).toMatchObject({
          organizationId: atelierNordId,
          actor: { type: 'user', id: camille.userId },
          rootKey: oldPricing.key,
          version: (before.get(payload.key)?.version ?? 0) + 1,
          listId: refonte.id,
          spaceId: produit.space.id,
          parentKey: before.get(payload.key)?.parentKey,
        });
        // One instant for every event, the archivedAt of the archive.
        expect(payload.occurredAt).toBe(payloads[0]?.occurredAt);
        expect(payload.occurredAt).toBe(archived.archivedAt);
      }
      expect(payloads[0]).toMatchObject({
        name: 'Ancienne page des tarifs',
        status: 'done',
        priority: 'basse',
        assigneeIds: [hugo.userId],
        labels: ['Front'],
        estimateMinutes: 120,
      });
      // Neither the archive nor the restoration is recorded in the activity.
      expect(await taskActivityTotal(oldPricing.key)).toBe(activityBefore);
    });

    it('answers an archived task again with 200 and the same version, and emits nothing, for its root and for a member', async () => {
      const root = await readTask(oldPricing.key);
      const member = await readTask(oldGrid.key);
      const total = await outboxTotal();

      expect(await archiveTask(oldPricing.key)).toEqual(root);
      expect(await archiveTask(oldGrid.key)).toEqual(member);
      expect(await outboxTotal()).toBe(total);
    });

    it('answers 404 for a task the actor does not see, then 403 for a view grantee, then 412 with the version, and archives with the right one', async () => {
      const version = (await readTask(interviewGuide.key, hugo)).version;
      const total = await outboxTotal();

      for (const key of ['CAD-99999', interviewGuide.key]) {
        expectProblem(
          await act('archive', 'tasks', key, camille, { headers: stale }),
          404,
          'task.not-found',
        );
      }
      expectProblem(
        await act('archive', 'tasks', interviewGuide.key, chloe),
        404,
        'task.not-found',
      );
      expectProblem(
        await act('archive', 'tasks', interviewGuide.key, lea, { headers: stale }),
        403,
        'access.role-insufficient',
        { role: 'view', requiredRole: 'edit' },
      );
      expectProblem(
        await act('archive', 'tasks', interviewGuide.key, hugo, { headers: stale }),
        412,
        'request.version-mismatch',
        { version },
      );
      expect((await readTask(interviewGuide.key, hugo)).archivedAt).toBeNull();
      expect(await outboxTotal()).toBe(total);

      interviewGuide = taskAnswer(
        await act('archive', 'tasks', interviewGuide.key, hugo, {
          headers: { 'If-Match': etagOf(version) },
        }),
        ArchiveTaskInternalResponse,
      );
      expect(interviewGuide).toMatchObject({
        version: version + 1,
        archivedBy: { type: 'user', id: hugo.userId },
      });
    });
  });

  // « Pages publiques » (Produit): what an archived task is left out of.
  let publicPages: ListBody;
  let homePage: TaskBody;
  let homeMockup: TaskBody;
  let homeTexts: TaskBody;
  let oldFaq: TaskBody;
  let obsoleteQuestions: TaskBody;
  let oldContact: TaskBody;
  let rootsBefore: { readonly keys: string[]; readonly total: number };
  let allBefore: { readonly keys: string[]; readonly total: number };
  let groupsTotalBefore = 0;
  let countsBefore: z.output<typeof GetListCountsInternalResponse>['counts'];
  let publicOverviewBefore: OverviewBody;
  let hugoMyTasksBefore: MyTasksBody;
  let hugoHomeBefore: HomeBody;
  let hugoLabelsBefore: string[];
  let activityBefore: z.output<typeof ListListActivityInternalResponse>;
  let archivedActivity = 0;

  describe('an archived task is left out of every collection and count, and reads by its key', () => {
    it('leaves « Ancienne FAQ » and its subtask out of the tasks of its list, its groups and counters, and the overview', async () => {
      publicPages = await createList(camille, produit.space.id, { name: 'Pages publiques' });
      homePage = await createTask(camille, publicPages.id, { name: 'Refondre la page d’accueil' });
      homeMockup = await createSubtask(homePage.key, { name: 'Maquette de la page d’accueil' });
      homeTexts = await createSubtask(homePage.key, { name: 'Textes de la page d’accueil' });
      oldFaq = await createTask(camille, publicPages.id, {
        name: 'Ancienne FAQ',
        priority: 'haute',
        assigneeIds: [hugo.userId],
        dueDate: '2026-11-05',
        labels: ['FAQ'],
      });
      obsoleteQuestions = await createSubtask(oldFaq.key, {
        name: 'Questions obsolètes',
        assigneeIds: [hugo.userId],
        dueDate: today,
        labels: ['FAQ'],
      });
      oldContact = await createSubtask(oldFaq.key, { name: 'Ancienne rubrique contact' });
      oldContact = await archiveTask(oldContact.key);

      rootsBefore = await tasksOf(publicPages.id);
      allBefore = await tasksOf(publicPages.id, 'all');
      groupsTotalBefore = (
        await read(
          CountTaskGroupsInternalResponse,
          `/internal/v1/lists/${publicPages.id}/task-groups`,
          camille,
          {
            groupBy: 'status',
            level: 'all',
          },
        )
      ).total;
      countsBefore = (
        await read(
          GetListCountsInternalResponse,
          `/internal/v1/lists/${publicPages.id}/counts`,
          camille,
          {
            today,
          },
        )
      ).counts;
      publicOverviewBefore = await overviewOf(produit.space.id);
      hugoMyTasksBefore = await myTasksOf(hugo);
      hugoHomeBefore = await homeOf(hugo);
      hugoLabelsBefore = await labelsOf(hugo);
      activityBefore = await listActivityOf(publicPages.id);
      archivedActivity =
        (await taskActivityTotal(oldFaq.key)) +
        (await taskActivityTotal(obsoleteQuestions.key)) +
        (await taskActivityTotal(homeTexts.key));
      expect(rootsBefore).toEqual({ keys: [homePage.key, oldFaq.key].sort(), total: 2 });
      expect(allBefore.total).toBe(5);
      expect(countsBefore).toMatchObject({ total: 2, late: 1 });

      oldFaq = await archiveTask(oldFaq.key);
      homeTexts = await archiveTask(homeTexts.key);

      expect(await tasksOf(publicPages.id)).toEqual({ keys: [homePage.key], total: 1 });
      expect(await tasksOf(publicPages.id, 'all')).toEqual({
        keys: [homePage.key, homeMockup.key].sort(),
        total: 2,
      });
      const groups = await read(
        CountTaskGroupsInternalResponse,
        `/internal/v1/lists/${publicPages.id}/task-groups`,
        camille,
        { groupBy: 'status', level: 'all' },
      );
      expect(groups.total).toBe(groupsTotalBefore - 3);
      expect(groups.items.find((group) => group.value === 'todo')?.count).toBe(2);
      const counts = await read(
        GetListCountsInternalResponse,
        `/internal/v1/lists/${publicPages.id}/counts`,
        camille,
        {
          today,
        },
      );
      expect(counts.counts).toEqual({
        ...countsBefore,
        total: 1,
        open: countsBefore.open - 1,
        late: 0,
      });
      const overview = await overviewOf(produit.space.id);
      expect(overview.taskCount).toBe(publicOverviewBefore.taskCount - 1);
      expect(overview.items.find((item) => item.list.id === publicPages.id)?.counts.total).toBe(1);
    });

    it('leaves them out of "Mes tâches", the stats and priorities of "Accueil" and the labels: a label only archived tasks carry disappears', async () => {
      expect(hugoMyTasksBefore.items.map((task) => task.key)).toEqual(
        expect.arrayContaining([oldFaq.key, obsoleteQuestions.key]) as unknown,
      );
      const myTasks = await myTasksOf(hugo);
      expect(myTasks.items.map((task) => task.key)).toEqual(
        hugoMyTasksBefore.items
          .map((task) => task.key)
          .filter((key) => key !== oldFaq.key && key !== obsoleteQuestions.key),
      );
      expect(myTasks.counts).toEqual({
        ...hugoMyTasksBefore.counts,
        open: hugoMyTasksBefore.counts.open - 2,
      });

      const home = await homeOf(hugo);
      expect(home.stats).toEqual({
        ...hugoHomeBefore.stats,
        assigned: hugoHomeBefore.stats.assigned - 2,
        late: hugoHomeBefore.stats.late - 1,
        dueToday: hugoHomeBefore.stats.dueToday - 1,
      });
      expect(hugoHomeBefore.priorities.map((task) => task.key)).toContain(oldFaq.key);
      expect(home.priorities.map((task) => task.key)).not.toContain(oldFaq.key);
      expect(home.priorities.map((task) => task.key)).not.toContain(obsoleteQuestions.key);

      expect(hugoLabelsBefore).toContain('FAQ');
      expect(await labelsOf(hugo)).toEqual(hugoLabelsBefore.filter((name) => name !== 'FAQ'));
      expect(await labelsOf(camille)).not.toContain('FAQ');
    });

    it('leaves an archived subtask out of the subtask counts, the subtasks and the detail of its live parent, and the activity of its list', async () => {
      const parent = await readTask(homePage.key);
      expect(parent.subtaskCounts).toEqual({ total: 1, closed: 0 });
      expect(await subtasksOf(homePage.key)).toEqual({ keys: [homeMockup.key], total: 1 });
      const detail = await detailOf(homePage.key);
      expect(detail.subtasks.map((task) => task.key)).toEqual([homeMockup.key]);
      expect(detail.task.subtaskCounts).toEqual({ total: 1, closed: 0 });
      expect((await tasksOf(publicPages.id)).keys).toEqual([homePage.key]);

      const activity = await listActivityOf(publicPages.id);
      expect(activity.total).toBe(activityBefore.total - archivedActivity);
      const archivedKeys = [oldFaq.key, obsoleteQuestions.key, homeTexts.key];
      expect(activityBefore.items.some((entry) => archivedKeys.includes(entry.task.key))).toBe(
        true,
      );
      expect(activity.items.filter((entry) => archivedKeys.includes(entry.task.key))).toEqual([]);
      expect(activity.items).toHaveLength(activity.total);
    });

    it('reads an archived task by its key: the task, its detail with the subtasks archived with it and not an older archive, its subtasks, its activity and the realtime check', async () => {
      const task = await readTask(oldFaq.key);
      expect(task).toMatchObject({
        key: oldFaq.key,
        archivedBy: { type: 'user', id: camille.userId },
        subtaskCounts: { total: 1, closed: 0 },
      });
      expect(task.archivedAt).not.toBeNull();
      expect(instantOf(oldContact.archivedAt)).toBeLessThan(instantOf(task.archivedAt));

      const detail = await detailOf(oldFaq.key);
      expect(detail.task).toEqual(task);
      expect(detail.subtasks.map((subtask) => subtask.key)).toEqual([obsoleteQuestions.key]);
      expect(await subtasksOf(oldFaq.key)).toEqual({ keys: [obsoleteQuestions.key], total: 1 });
      expect((await detailOf(obsoleteQuestions.key)).parent).toEqual({
        key: oldFaq.key,
        name: 'Ancienne FAQ',
        status: 'todo',
      });
      // An archive alone shows no subtask of the archive of its parent.
      expect(await subtasksOf(oldContact.key)).toEqual({ keys: [], total: 0 });
      expect(await taskActivityTotal(oldFaq.key)).toBeGreaterThanOrEqual(1);

      const realtime = { issuer: 'realtime-gateway' } as const;
      for (const viewer of [camille, hugo]) {
        const response = await send(
          'get',
          `/internal/v1/tasks/${oldFaq.key}/access`,
          viewer,
          realtime,
        );
        expect(response.status, response.text).toBe(200);
        expect(conforms(CheckTaskAccessInternalResponse, bodyOf(response))).toEqual({
          role: 'edit',
          spaceId: produit.space.id,
          listId: publicPages.id,
          taskKey: oldFaq.key,
        });
      }
      const archivedInRecherche = await send(
        'get',
        `/internal/v1/tasks/${interviewGuide.key}/access`,
        lea,
        realtime,
      );
      expect(archivedInRecherche.status, archivedInRecherche.text).toBe(200);
      expect(conforms(CheckTaskAccessInternalResponse, bodyOf(archivedInRecherche))).toMatchObject({
        role: 'view',
        taskKey: interviewGuide.key,
      });
    });
  });

  describe('an archived task refuses every change with 409 task.archived', () => {
    it('answers 409 task.archived with its key to a patch of its name, status, list or parent, an assignee, a label, a checklist item and a new subtask, and writes nothing', async () => {
      const before = await readTask(oldPricing.key);
      const member = await readTask(exportShots.key);
      const subtasksBefore = await subtasksOf(oldPricing.key);
      const total = await outboxTotal();
      const key = oldPricing.key;
      const calls: readonly (readonly [HttpMethod, string, object | undefined])[] = [
        ['patch', `/internal/v1/tasks/${key}`, { name: 'Nouvelle page des tarifs' }],
        ['patch', `/internal/v1/tasks/${key}`, { status: 'progress' }],
        ['patch', `/internal/v1/tasks/${key}`, { listId: backlog.id }],
        ['patch', `/internal/v1/tasks/${key}`, { parentKey: null }],
        ['put', `/internal/v1/tasks/${key}/assignees/${lea.userId}`, {}],
        ['delete', `/internal/v1/tasks/${key}/assignees/${hugo.userId}`, undefined],
        ['post', `/internal/v1/tasks/${key}/labels/add`, { name: 'Archivé' }],
        ['post', `/internal/v1/tasks/${key}/labels/remove`, { name: 'Front' }],
        ['post', `/internal/v1/tasks/${key}/checklist-items`, { text: 'Relire' }],
        ['patch', `/internal/v1/tasks/${key}/checklist-items/${pricingItemId}`, { done: true }],
        ['post', `/internal/v1/tasks/${key}/subtasks`, { name: 'Nouvelle grille' }],
      ];

      for (const [method, path, body] of calls) {
        expectProblem(
          await send(method, path, camille, body === undefined ? {} : { body }),
          409,
          'task.archived',
          { key },
        );
      }
      expectProblem(
        await send('patch', `/internal/v1/tasks/${exportShots.key}`, camille, {
          body: { parentKey: null },
        }),
        409,
        'task.archived',
        { key: exportShots.key },
      );
      expectProblem(
        await send('post', `/internal/v1/tasks/${exportShots.key}/subtasks`, camille, {
          body: { name: 'Sous-capture' },
        }),
        409,
        'task.archived',
        { key: exportShots.key },
      );

      expect(await readTask(oldPricing.key)).toEqual(before);
      expect(await readTask(exportShots.key)).toEqual(member);
      expect(await subtasksOf(oldPricing.key)).toEqual(subtasksBefore);
      expect(await outboxTotal()).toBe(total);
    });

    it('answers 409 with the key of the parent to a patch that attaches a live task under an archived one', async () => {
      const loose = await createTask(camille, refonte.id, { name: 'Plan de redirection' });
      const total = await outboxTotal();

      for (const parent of [oldPricing, exportShots]) {
        expectProblem(
          await send('patch', `/internal/v1/tasks/${loose.key}`, camille, {
            body: { parentKey: parent.key },
          }),
          409,
          'task.archived',
          { key: parent.key },
        );
      }

      expect(await readTask(loose.key)).toEqual(loose);
      expect(await outboxTotal()).toBe(total);
    });

    it('refuses a view grantee with 403 before 409, and a stale If-Match with 409 before 412', async () => {
      for (const headers of [{}, stale]) {
        expectProblem(
          await send('patch', `/internal/v1/tasks/${interviewGuide.key}`, lea, {
            body: { name: 'Fuite' },
            headers,
          }),
          403,
          'access.role-insufficient',
          { role: 'view', requiredRole: 'edit' },
        );
      }
      for (const [method, path, body] of [
        ['patch', `/internal/v1/tasks/${oldPricing.key}`, { name: 'Autre nom' }],
        ['put', `/internal/v1/tasks/${oldPricing.key}/assignees/${lea.userId}`, {}],
        ['post', `/internal/v1/tasks/${oldPricing.key}/labels/add`, { name: 'Autre' }],
      ] as const) {
        expectProblem(
          await send(method, path, camille, { body, headers: stale }),
          409,
          'task.archived',
          { key: oldPricing.key },
        );
      }
      expect((await readTask(interviewGuide.key, hugo)).version).toBe(interviewGuide.version);
    });
  });

  // « Plan de la refonte » with its subtask archived, then 25 live ones; « Migrer les
  // redirections » with its subtask archived, then moved.
  let plan: TaskBody;
  let inventory: TaskBody;
  let migration: TaskBody;
  let oldRules: TaskBody;

  describe('archived subtasks do not count among the 25 subtasks of a parent, and stay put when it moves', () => {
    it('lets a parent take 25 live subtasks once one of its subtasks is archived, and refuses the 26th', async () => {
      plan = await createTask(camille, refonte.id, { name: 'Plan de la refonte' });
      inventory = await createSubtask(plan.key, { name: 'Inventaire de l’existant' });
      inventory = await archiveTask(inventory.key);

      for (let step = 1; step <= 25; step += 1) {
        await createSubtask(plan.key, { name: `Étape ${String(step)}` });
      }
      expectProblem(
        await send('post', `/internal/v1/tasks/${plan.key}/subtasks`, camille, {
          body: { name: 'Étape 26' },
        }),
        422,
        'task.subtask-limit-reached',
      );

      expect((await readTask(plan.key)).subtaskCounts).toEqual({ total: 25, closed: 0 });
      expect((await subtasksOf(plan.key)).total).toBe(25);
      expect(await readTask(inventory.key)).toEqual(inventory);
    });

    it('leaves an archived subtask in its list when its parent moves to another list: it keeps its stored parent and reads as detached', async () => {
      migration = await createTask(camille, refonte.id, { name: 'Migrer les redirections' });
      oldRules = await createSubtask(migration.key, { name: 'Anciennes règles nginx' });
      oldRules = await archiveTask(oldRules.key);
      expect(oldRules).toMatchObject({ listId: refonte.id, parentKey: migration.key });
      const total = (await outboxOf('key', oldRules.key)).length;

      const moved = await patchTask(migration.key, { listId: maintenance.id });

      expect(moved).toMatchObject({
        listId: maintenance.id,
        subtaskCounts: { total: 0, closed: 0 },
      });
      // Nothing of the archive changed but the reading of its parent, now in another list.
      expect(await readTask(oldRules.key)).toEqual({ ...oldRules, parentKey: null });
      const [stored] = await asSystem<{ readonly list_id: string; readonly parent_id: string }>(
        `select list_id::text as list_id, parent_id::text as parent_id from tasks
          where organization_id = $1 and id = $2`,
        [atelierNordId, await taskIdOf(oldRules.key)],
      );
      expect(stored).toEqual({ list_id: refonte.id, parent_id: await taskIdOf(migration.key) });
      expect(await outboxOf('key', oldRules.key)).toHaveLength(total);
    });
  });

  // « Plan de tests » in "Recette", archived with its list; « Audit des liens » archived after its
  // subtask; « Refonte du tunnel d’achat » attached deeper after its subtask was archived.
  describe('restoring a task restores its whole archive from its root', () => {
    it('restores the archive of « Ancienne page des tarifs » from a grandchild: 200 with the root, every member live at the next version, and task.unarchived.v1 root first with rootKey', async () => {
      const members = [oldPricing.key, oldGrid.key, redirect.key, exportShots.key];
      const before = new Map<string, TaskBody>();
      for (const key of members) {
        before.set(key, await readTask(key));
      }
      const pdfsBefore = await readTask(pdfs.key);
      const activityBeforeRestore = await taskActivityTotal(oldPricing.key);
      const eventsBefore = (await outboxOf('rootKey', oldPricing.key)).length;

      const root = await unarchiveTask(exportShots.key);

      expect(root).toMatchObject({
        key: oldPricing.key,
        parentKey: null,
        version: (before.get(oldPricing.key)?.version ?? 0) + 1,
        archivedAt: null,
        archivedBy: null,
        subtaskCounts: { total: 2, closed: 1 },
      });
      for (const key of members) {
        const member = await readTask(key);
        expect(member, key).toMatchObject({
          parentKey: before.get(key)?.parentKey,
          listId: refonte.id,
          version: (before.get(key)?.version ?? 0) + 1,
          archivedAt: null,
          archivedBy: null,
        });
      }
      expect(await readTask(pdfs.key)).toEqual(pdfsBefore);
      const roots = await archiveRootsOf(await Promise.all(members.map((key) => taskIdOf(key))));
      expect([...roots.values()]).toEqual(members.map(() => null));

      const events = await outboxSince('rootKey', oldPricing.key, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual(
        members.map(() => 'task.unarchived.v1'),
      );
      const payloads = events.map((event) =>
        conforms(taskEventSchemas['task.unarchived.v1'], event.payload),
      );
      expect(payloads.map((payload) => payload.key)).toEqual(members);
      for (const payload of payloads) {
        expect(payload).toMatchObject({
          actor: { type: 'user', id: camille.userId },
          rootKey: oldPricing.key,
          version: (before.get(payload.key)?.version ?? 0) + 1,
          parentKey: before.get(payload.key)?.parentKey,
          listId: refonte.id,
        });
      }
      expect(await taskActivityTotal(oldPricing.key)).toBe(activityBeforeRestore);
      expect((await tasksOf(refonte.id)).keys).toContain(oldPricing.key);
    });

    it('keeps the parent of a restored root that can take it', async () => {
      const before = await readTask(pdfs.key);
      const eventsBefore = (await outboxOf('rootKey', pdfs.key)).length;

      const restored = await unarchiveTask(pdfs.key);

      expect(restored).toMatchObject({
        key: pdfs.key,
        parentKey: oldPricing.key,
        version: before.version + 1,
        archivedAt: null,
      });
      const events = await outboxSince('rootKey', pdfs.key, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual(['task.unarchived.v1']);
      expect(conforms(taskEventSchemas['task.unarchived.v1'], events[0]?.payload)).toMatchObject({
        key: pdfs.key,
        rootKey: pdfs.key,
        parentKey: oldPricing.key,
      });
      expect((await readTask(oldPricing.key)).subtaskCounts.total).toBe(3);
    });

    it('restores the archived list of a restored task with it: list.unarchived.v1 comes before the task events', async () => {
      const recette = await createList(camille, produit.space.id, { name: 'Recette' });
      const testPlan = await createTask(camille, recette.id, { name: 'Plan de tests' });
      const paymentCases = await createSubtask(testPlan.key, { name: 'Cas de paiement' });
      await archiveTask(testPlan.key);
      const archivedList = await archiveList(recette.id);
      const eventsBefore = (await outboxOf('listId', recette.id)).length;

      const root = await unarchiveTask(paymentCases.key);

      expect(root).toMatchObject({ key: testPlan.key, archivedAt: null, listId: recette.id });
      expect(await readList(recette.id)).toMatchObject({
        version: archivedList.version + 1,
        archivedAt: null,
        archivedBy: null,
      });
      expect((await readTask(paymentCases.key)).archivedAt).toBeNull();
      const events = await outboxSince('listId', recette.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual([
        'list.unarchived.v1',
        'task.unarchived.v1',
        'task.unarchived.v1',
      ]);
      expect(conforms(taskEventSchemas['list.unarchived.v1'], events[0]?.payload)).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        listId: recette.id,
        version: archivedList.version + 1,
      });
      expect(
        events
          .slice(1)
          .map((event) => conforms(taskEventSchemas['task.unarchived.v1'], event.payload).key),
      ).toEqual([testPlan.key, paymentCases.key]);
      expect(await listNamesOf(produit.space.id)).toContain('Recette');
    });

    it('detaches the restored root from a parent that is archived: parentKey null in the task and in task.unarchived.v1', async () => {
      const audit = await createTask(camille, refonte.id, { name: 'Audit des liens' });
      const broken = await createSubtask(audit.key, { name: 'Liens cassés' });
      await archiveTask(broken.key);
      const archivedAudit = await archiveTask(audit.key);
      const eventsBefore = (await outboxOf('rootKey', broken.key)).length;

      const restored = await unarchiveTask(broken.key);

      expect(restored).toMatchObject({
        key: broken.key,
        parentKey: null,
        listId: refonte.id,
        archivedAt: null,
      });
      expect(await readTask(audit.key)).toEqual(archivedAudit);
      expect(await unarchivedSince(broken.key, eventsBefore)).toEqual([
        { key: broken.key, rootKey: broken.key, parentKey: null },
      ]);
      expect((await tasksOf(refonte.id)).keys).toContain(broken.key);
    });

    it('detaches the restored root from a parent that holds 25 live subtasks', async () => {
      const eventsBefore = (await outboxOf('rootKey', inventory.key)).length;

      const restored = await unarchiveTask(inventory.key);

      expect(restored).toMatchObject({ key: inventory.key, parentKey: null, archivedAt: null });
      expect((await readTask(plan.key)).subtaskCounts.total).toBe(25);
      expect(await unarchivedSince(inventory.key, eventsBefore)).toEqual([
        { key: inventory.key, rootKey: inventory.key, parentKey: null },
      ]);
    });

    it('detaches the restored root when its parent was attached deeper meanwhile and the archive would exceed 3 levels', async () => {
      const checkout = await createTask(camille, refonte.id, { name: 'Refonte du tunnel d’achat' });
      const cart = await createSubtask(checkout.key, { name: 'Panier' });
      const summary = await createSubtask(cart.key, { name: 'Récapitulatif de commande' });
      await archiveTask(cart.key);
      const programme = await createTask(camille, refonte.id, { name: 'Chantier e-commerce' });
      expect(await patchTask(checkout.key, { parentKey: programme.key })).toMatchObject({
        parentKey: programme.key,
      });
      const eventsBefore = (await outboxOf('rootKey', cart.key)).length;

      const restored = await unarchiveTask(summary.key);

      expect(restored).toMatchObject({ key: cart.key, parentKey: null, archivedAt: null });
      expect(await readTask(summary.key)).toMatchObject({ parentKey: cart.key, archivedAt: null });
      expect((await readTask(checkout.key)).subtaskCounts.total).toBe(0);
      expect(await unarchivedSince(cart.key, eventsBefore)).toEqual([
        { key: cart.key, rootKey: cart.key, parentKey: null },
        { key: summary.key, rootKey: cart.key, parentKey: cart.key },
      ]);
    });

    it('detaches the restored root from a parent that moved to another list, and keeps it in its list', async () => {
      const eventsBefore = (await outboxOf('rootKey', oldRules.key)).length;

      const restored = await unarchiveTask(oldRules.key);

      expect(restored).toMatchObject({
        key: oldRules.key,
        parentKey: null,
        listId: refonte.id,
        archivedAt: null,
      });
      expect((await readTask(migration.key)).listId).toBe(maintenance.id);
      expect(await unarchivedSince(oldRules.key, eventsBefore)).toEqual([
        { key: oldRules.key, rootKey: oldRules.key, parentKey: null },
      ]);
    });

    it('answers a task that is not archived with 200 and the same version, and emits nothing, after its If-Match', async () => {
      const before = await readTask(oldPricing.key);
      const total = await outboxTotal();

      expect(await unarchiveTask(oldPricing.key)).toEqual(before);
      expectProblem(
        await act('unarchive', 'tasks', oldPricing.key, camille, { headers: stale }),
        412,
        'request.version-mismatch',
        { version: before.version },
      );
      expect(await outboxTotal()).toBe(total);
    });

    it('answers 404 for a task the actor does not see, then 403 for a view grantee, then 412 with the version, and restores nothing', async () => {
      const total = await outboxTotal();

      expectProblem(
        await act('unarchive', 'tasks', interviewGuide.key, camille, { headers: stale }),
        404,
        'task.not-found',
      );
      expectProblem(await act('unarchive', 'tasks', 'CAD-99999', camille), 404, 'task.not-found');
      expectProblem(
        await act('unarchive', 'tasks', interviewGuide.key, lea, { headers: stale }),
        403,
        'access.role-insufficient',
        { role: 'view', requiredRole: 'edit' },
      );
      expectProblem(
        await act('unarchive', 'tasks', interviewGuide.key, hugo, { headers: stale }),
        412,
        'request.version-mismatch',
        { version: interviewGuide.version },
      );

      expect(await readTask(interviewGuide.key, hugo)).toEqual(interviewGuide);
      expect(await outboxTotal()).toBe(total);
    });
  });

  // « Refondre les emails » of "Emails transactionnels" (Produit) moves to "Emails marketing" once
  // its subtask « Email de bienvenue » is archived with its own subtask; Mathis, a guest with
  // `edit` on "Emails transactionnels" alone, does not see "Emails marketing". « Refondre les
  // notifications » moves there and back.
  describe('an archived root whose parent moved to another list reads as detached, as its restoration leaves it', () => {
    let transactional: ListBody;
    let marketingEmails: ListBody;
    let emails: TaskBody;
    let welcome: TaskBody;
    let welcomeText: TaskBody;

    /**
     * Checks that an answer names nothing of a task: neither its key, its id nor its name.
     *
     * @param body - What the routes answered.
     * @param task - The task that must not appear.
     * @param taskId - Its id, as stored.
     * @param label - What the answer is, for the message.
     */
    function expectNothingOf(body: unknown, task: TaskBody, taskId: string, label: string): void {
      const text = JSON.stringify(body);
      for (const value of [task.key, task.name, taskId]) {
        expect(text, `${label} names ${value}`).not.toContain(JSON.stringify(value));
      }
    }

    it('reads the root with parentKey null in the task, its detail (parent null) and the page "Archives", for Mathis and for Camille, and never names the parent to Mathis', async () => {
      transactional = await createList(camille, produit.space.id, {
        name: 'Emails transactionnels',
      });
      marketingEmails = await createList(camille, produit.space.id, { name: 'Emails marketing' });
      await grant(camille, 'lists', transactional.id, mathis.userId, 'edit');
      emails = await createTask(camille, transactional.id, { name: 'Refondre les emails' });
      welcome = await createSubtask(emails.key, { name: 'Email de bienvenue' });
      welcomeText = await createSubtask(welcome.key, { name: 'Texte de l’email de bienvenue' });
      const archived = await archiveTask(welcome.key);
      // Archived under a parent of its list, it reads under it.
      expect(archived).toMatchObject({ parentKey: emails.key, listId: transactional.id });

      const moved = await patchTask(emails.key, { listId: marketingEmails.id });

      expect(moved).toMatchObject({
        listId: marketingEmails.id,
        subtaskCounts: { total: 0, closed: 0 },
      });
      expectProblem(
        await send('get', `/internal/v1/tasks/${emails.key}`, mathis),
        404,
        'task.not-found',
      );
      const emailsId = await taskIdOf(emails.key);
      for (const viewer of [mathis, camille]) {
        const name = viewer === mathis ? 'Mathis' : 'Camille';
        const task = await readTask(welcome.key, viewer);
        expect(task, name).toEqual({ ...archived, parentKey: null });
        const detail = await read(
          GetTaskDetailInternalResponse,
          `/internal/v1/tasks/${welcome.key}/detail`,
          viewer,
        );
        expect(detail.parent, name).toBeNull();
        expect(detail.task, name).toEqual(task);
        expect(detail.list.id, name).toBe(transactional.id);
        expect(detail.subtasks.map((subtask) => subtask.key)).toEqual([welcomeText.key]);
        const subtasks = await read(
          ListSubtasksInternalResponse,
          `/internal/v1/tasks/${welcome.key}/subtasks`,
          viewer,
        );
        expect(subtasks.items.map((subtask) => [subtask.key, subtask.parentKey])).toEqual([
          [welcomeText.key, welcome.key],
        ]);
        const page = await archivedTasksOf(viewer);
        const item = page.items.find((candidate) => candidate.task.key === welcome.key);
        expect(item, name).toMatchObject({
          task: { key: welcome.key, parentKey: null, listId: transactional.id },
          list: { id: transactional.id, state: 'active' },
          subtaskCount: 1,
        });
        if (viewer === mathis) {
          expectNothingOf([task, detail, subtasks, page], emails, emailsId, name);
        }
      }
      // Its stored parent stays, for the restoration to decide.
      const [stored] = await asSystem<{ readonly parent_id: string }>(
        'select parent_id::text as parent_id from tasks where organization_id = $1 and id = $2',
        [atelierNordId, await taskIdOf(welcome.key)],
      );
      expect(stored?.parent_id).toBe(emailsId);
    });

    it('restores it detached for Mathis: parentKey null in the answer and in task.unarchived.v1, the subtask archived with it under it, and the parent left in its list without it', async () => {
      const eventsBefore = (await outboxOf('rootKey', welcome.key)).length;

      const restored = await unarchiveTask(welcome.key, mathis);

      expect(restored).toMatchObject({
        key: welcome.key,
        parentKey: null,
        listId: transactional.id,
        archivedAt: null,
        archivedBy: null,
        subtaskCounts: { total: 1, closed: 0 },
      });
      expect(await unarchivedSince(welcome.key, eventsBefore)).toEqual([
        { key: welcome.key, rootKey: welcome.key, parentKey: null },
        { key: welcomeText.key, rootKey: welcome.key, parentKey: welcome.key },
      ]);
      expectNothingOf(restored, emails, await taskIdOf(emails.key), 'the restoration');
      expect(await readTask(emails.key)).toMatchObject({
        listId: marketingEmails.id,
        subtaskCounts: { total: 0, closed: 0 },
      });
      const [stored] = await asSystem<{ readonly parent_id: string | null }>(
        'select parent_id::text as parent_id from tasks where organization_id = $1 and id = $2',
        [atelierNordId, await taskIdOf(welcome.key)],
      );
      expect(stored?.parent_id).toBeNull();
      expect((await tasksOf(transactional.id)).keys).toContain(welcome.key);
    });

    it('reads the parent again once it moves back into the list of the root, and the restoration keeps the root under it', async () => {
      const notifications = await createTask(camille, transactional.id, {
        name: 'Refondre les notifications',
      });
      const reminder = await createSubtask(notifications.key, { name: 'Notification de rappel' });
      const archived = await archiveTask(reminder.key);
      await patchTask(notifications.key, { listId: marketingEmails.id });
      expect((await readTask(reminder.key, mathis)).parentKey).toBeNull();

      await patchTask(notifications.key, { listId: transactional.id });

      expect(await readTask(reminder.key, mathis)).toEqual(archived);
      const detail = await read(
        GetTaskDetailInternalResponse,
        `/internal/v1/tasks/${reminder.key}/detail`,
        mathis,
      );
      expect(detail.parent).toEqual({
        key: notifications.key,
        name: 'Refondre les notifications',
        status: 'todo',
      });
      expect(
        (await archivedTasksOf(mathis)).items.find((item) => item.task.key === reminder.key)?.task
          .parentKey,
      ).toBe(notifications.key);
      const eventsBefore = (await outboxOf('rootKey', reminder.key)).length;

      const restored = await unarchiveTask(reminder.key, mathis);

      expect(restored).toMatchObject({
        key: reminder.key,
        parentKey: notifications.key,
        listId: transactional.id,
        archivedAt: null,
      });
      expect(await unarchivedSince(reminder.key, eventsBefore)).toEqual([
        { key: reminder.key, rootKey: reminder.key, parentKey: notifications.key },
      ]);
      expect((await readTask(notifications.key, mathis)).subtaskCounts).toEqual({
        total: 1,
        closed: 0,
      });
    });
  });

  // "Marketing" of Camille: « Campagne de rentrée », « Salon 2026 », « Budget 2027 » (closed to
  // the organization) and « Réseaux sociaux », with the tasks archived for the pages "Archives".
  let marketing: SpaceCreated;
  let campaign: ListBody;
  let fair: ListBody;
  let budget: ListBody;
  let socials: ListBody;
  let oldVisual: TaskBody;
  let calendar: TaskBody;
  let booth: TaskBody;
  let boothCost: TaskBody;

  describe('the pages "Archives" list what the actor sees, the most recently archived first', () => {
    let listsBaseline: ArchivedListPageBody;
    let tasksBaseline: ArchivedTaskPageBody;

    it('lists the archived lists, the most recently archived first, with their live top-level tasks and the total on every page', async () => {
      marketing = await createSpace(camille, {
        name: 'Marketing',
        prefix: 'MKT',
        icon: 'megaphone',
        color: 'orange',
      });
      campaign = await createList(camille, marketing.space.id, { name: 'Campagne de rentrée' });
      fair = await createList(camille, marketing.space.id, { name: 'Salon 2026' });
      budget = await createList(camille, marketing.space.id, {
        name: 'Budget 2027',
        organizationAccess: false,
      });
      socials = await createList(camille, marketing.space.id, { name: 'Réseaux sociaux' });
      await createTask(camille, campaign.id, { name: 'Affiche de rentrée' });
      await createTask(camille, campaign.id, {
        name: 'Newsletter de septembre',
        subtasks: [{ name: 'Objet du message' }],
      });
      oldVisual = await createTask(camille, campaign.id, { name: 'Ancien visuel de rentrée' });
      calendar = await createTask(camille, socials.id, { name: 'Calendrier éditorial' });
      const posts = await createSubtask(calendar.key, { name: 'Posts de novembre' });
      await createSubtask(posts.key, { name: 'Visuels des posts' });
      booth = await createTask(camille, fair.id, { name: 'Réserver le stand' });
      boothCost = await createTask(camille, budget.id, { name: 'Chiffrer le stand' });
      await grant(camille, 'lists', fair.id, nadia.userId, 'view');
      listsBaseline = await archivedListsOf(camille);
      tasksBaseline = await archivedTasksOf(camille);
      expect(await archivedListsOf(nadia)).toEqual({ items: [], nextCursor: null, total: 0 });

      oldVisual = await archiveTask(oldVisual.key);
      calendar = await archiveTask(calendar.key);
      booth = await archiveTask(booth.key);
      boothCost = await archiveTask(boothCost.key);
      campaign = await archiveList(campaign.id);
      fair = await archiveList(fair.id);
      budget = await archiveList(budget.id);

      const page = await archivedListsOf(camille);
      expect(page.total).toBe(listsBaseline.total + 3);
      expect(page.nextCursor).toBeNull();
      expect(page.items.map((item) => item.list.id)).toEqual([
        budget.id,
        fair.id,
        campaign.id,
        ...listsBaseline.items.map((item) => item.list.id),
      ]);
      expect(page.items.slice(0, 3)).toEqual([
        { list: budget, taskCount: 0 },
        { list: fair, taskCount: 0 },
        { list: campaign, taskCount: 2 },
      ]);

      const walked = await walkPages(async (cursor) => {
        const current = await archivedListsOf(camille, { limit: 2, cursor: cursor ?? undefined });
        return {
          ids: current.items.map((item) => item.list.id),
          nextCursor: current.nextCursor,
          total: current.total,
        };
      }, page.total);
      expect(walked).toEqual(page.items.map((item) => item.list.id));
    });

    it('lists the roots of the archives the actor sees, with their list, active or archived, and the subtasks archived with them', async () => {
      const page = await archivedTasksOf(camille);

      expect(page.total).toBe(tasksBaseline.total + 4);
      expect(page.items.map((item) => item.task.key)).toEqual([
        boothCost.key,
        booth.key,
        calendar.key,
        oldVisual.key,
        ...tasksBaseline.items.map((item) => item.task.key),
      ]);
      const [ofBudget, ofFair, ofSocials, ofCampaign] = page.items;
      expect(ofSocials).toMatchObject({
        task: {
          key: calendar.key,
          name: 'Calendrier éditorial',
          parentKey: null,
          listId: socials.id,
          subtaskCounts: { total: 1, closed: 0 },
          version: calendar.version,
        },
        list: {
          id: socials.id,
          spaceId: marketing.space.id,
          name: 'Réseaux sociaux',
          state: 'active',
        },
        subtaskCount: 2,
        archivedBy: { type: 'user', id: camille.userId },
      });
      expect(instantOf(ofSocials?.archivedAt)).toBe(instantOf(calendar.archivedAt));
      expect(ofCampaign).toMatchObject({
        task: { key: oldVisual.key },
        list: { id: campaign.id, name: 'Campagne de rentrée', state: 'archived' },
        subtaskCount: 0,
      });
      expect(ofFair).toMatchObject({ list: { id: fair.id, state: 'archived' }, subtaskCount: 0 });
      expect(ofBudget).toMatchObject({ list: { id: budget.id, state: 'archived' } });
      // Only roots: no member of an archive is listed apart from its root.
      const keys = page.items.map((item) => item.task.key);
      expect(keys).toContain(oldFaq.key);
      expect(keys).not.toContain(obsoleteQuestions.key);
      expect(new Set(keys).size).toBe(keys.length);

      const walked = await walkPages(async (cursor) => {
        const current = await archivedTasksOf(camille, { limit: 3, cursor: cursor ?? undefined });
        return {
          ids: current.items.map((item) => item.task.key),
          nextCursor: current.nextCursor,
          total: current.total,
        };
      }, page.total);
      expect(walked).toEqual(keys);
    });

    it('refuses a cursor or a limit the pages do not take with 400 request.invalid', async () => {
      const lists = await archivedListsOf(camille, { limit: 1 });
      const tasks = await archivedTasksOf(camille, { limit: 1 });
      expect(lists.nextCursor).not.toBeNull();
      expect(tasks.nextCursor).not.toBeNull();

      for (const [path, query] of [
        ['/internal/v1/archives/lists', { cursor: 'pas-un-curseur' }],
        ['/internal/v1/archives/tasks', { cursor: 'pas-un-curseur' }],
        ['/internal/v1/archives/lists', { cursor: tasks.nextCursor ?? '' }],
        ['/internal/v1/archives/tasks', { cursor: lists.nextCursor ?? '' }],
      ] as const) {
        const response = await send('get', `${path}${queryOf(query)}`, camille);
        expectProblem(response, 400, 'request.invalid', {
          issues: [
            expect.objectContaining({
              in: 'query',
              path: 'cursor',
              code: 'invalid_cursor',
            }) as unknown,
          ],
        });
      }
      for (const path of ['/internal/v1/archives/lists', '/internal/v1/archives/tasks']) {
        for (const limit of ['0', '101', 'dix']) {
          expectProblem(
            await send('get', `${path}?limit=${limit}`, camille),
            400,
            'request.invalid',
          );
        }
      }
    });

    it('hides an archived list closed to the organization from a member, and shows a guest only what is shared with her', async () => {
      const ofLea = await archivedListsOf(lea);
      const leaLists = ofLea.items.map((item) => item.list.id);
      expect(leaLists).toEqual(expect.arrayContaining([campaign.id, fair.id]) as unknown);
      expect(leaLists).not.toContain(budget.id);
      expect(ofLea.total).toBe(leaLists.length);
      const leaTasks = await archivedTasksOf(lea);
      const leaKeys = leaTasks.items.map((item) => item.task.key);
      expect(leaKeys).toEqual(
        expect.arrayContaining([
          oldVisual.key,
          calendar.key,
          booth.key,
          interviewGuide.key,
        ]) as unknown,
      );
      expect(leaKeys).not.toContain(boothCost.key);
      expect(leaTasks.total).toBe(leaKeys.length);
      expect(
        leaTasks.items.find((item) => item.task.key === interviewGuide.key)?.list,
      ).toMatchObject({ id: entretiens.id, state: 'active' });

      const ofNadia = await archivedListsOf(nadia);
      expect(ofNadia).toEqual({
        items: [{ list: { ...fair, callerRole: 'view' }, taskCount: 0 }],
        nextCursor: null,
        total: 1,
      });
      const nadiaTasks = await archivedTasksOf(nadia);
      expect(nadiaTasks.items.map((item) => item.task.key)).toEqual([booth.key]);
      expect(nadiaTasks.total).toBe(1);
    });

    it('answers an actor who sees no list an empty page on both tabs', async () => {
      expect(await archivedListsOf(chloe)).toEqual({ items: [], nextCursor: null, total: 0 });
      expect(await archivedTasksOf(chloe)).toEqual({ items: [], nextCursor: null, total: 0 });
    });
  });

  describe('access requests for archived targets behave as for live ones', () => {
    it('stores a request for an archived list and for an archived task the requester does not see, which the manager lists', async () => {
      for (const body of [{ listId: budget.id }, { taskKey: calendar.key }]) {
        const response = await send('post', '/internal/v1/access-requests', noe, { body });
        expect(response.status, JSON.stringify(body)).toBe(202);
        expect(response.text).toBe('');
      }

      const pending = await read(
        ListAccessRequestsInternalResponse,
        '/internal/v1/access-requests',
        camille,
        {
          limit: 100,
        },
      );
      const ofNoe = pending.items.filter((item) => item.requester.userId === noe.userId);
      expect(ofNoe).toHaveLength(2);
      expect(ofNoe.find((item) => item.target === 'list')).toMatchObject({
        spaceId: marketing.space.id,
        listId: budget.id,
        task: null,
        state: 'pending',
      });
      expect(ofNoe.find((item) => item.target === 'task')).toMatchObject({
        spaceId: marketing.space.id,
        listId: socials.id,
        task: { key: calendar.key, name: 'Calendrier éditorial', status: 'todo' },
        state: 'pending',
      });
    });

    it('approves them as grants of their lists: the requester then reads the archived list and the archived task', async () => {
      const pending = await read(
        ListAccessRequestsInternalResponse,
        '/internal/v1/access-requests',
        camille,
        {
          limit: 100,
        },
      );
      for (const [target, role] of [
        ['list', 'view'],
        ['task', 'comment'],
      ] as const) {
        const item = pending.items.find(
          (candidate) => candidate.requester.userId === noe.userId && candidate.target === target,
        );
        const response = await send(
          'post',
          `/internal/v1/access-requests/${item?.id ?? ''}/approval`,
          camille,
          { body: { role } },
        );
        expect(response.status, response.text).toBe(200);
        expect(conforms(ApproveAccessRequestInternalResponse, bodyOf(response))).toMatchObject({
          target,
          state: 'approved',
          role,
        });
      }

      expect(await readList(budget.id, noe)).toMatchObject({
        callerRole: 'view',
        archivedAt: budget.archivedAt,
      });
      expect(await readTask(calendar.key, noe)).toMatchObject({
        key: calendar.key,
        archivedAt: calendar.archivedAt,
      });
      expect((await archivedListsOf(noe)).items.map((item) => item.list.id)).toEqual([budget.id]);
      expect((await archivedTasksOf(noe)).items.map((item) => item.task.key)).toEqual([
        boothCost.key,
        calendar.key,
      ]);
    });
  });

  describe('another organization never reaches the archives of Atelier Nord', () => {
    let deltaList: ListBody;
    let deltaTask: TaskBody;

    it('answers 404 to the owner of the second organization for an archive, a restoration or the pages of Atelier Nord', async () => {
      const boutique = await createSpace(
        solene,
        { name: 'Boutique', prefix: 'BOU' },
        atelierDeltaId,
      );
      deltaList = boutique.firstList;
      deltaTask = await createTask(
        solene,
        deltaList.id,
        { name: 'Ancienne fiche produit' },
        atelierDeltaId,
      );
      const delta = { organizationId: atelierDeltaId };
      deltaTask = taskAnswer(
        await act('archive', 'tasks', deltaTask.key, solene, delta),
        ArchiveTaskInternalResponse,
      );
      deltaList = listAnswer(
        await act('archive', 'lists', deltaList.id, solene, delta),
        ArchiveListInternalResponse,
      );
      const total = await outboxTotal();

      for (const [action, listId] of [
        ['archive', sprint14.id],
        ['unarchive', campaign.id],
      ] as const) {
        expectProblem(await act(action, 'lists', listId, solene, delta), 404, 'list.not-found');
        expectProblem(await act(action, 'lists', listId, solene), 404, 'organization.not-found');
      }
      for (const [action, key] of [
        ['archive', oldPricing.key],
        ['unarchive', oldVisual.key],
      ] as const) {
        expectProblem(await act(action, 'tasks', key, solene, delta), 404, 'task.not-found');
        expectProblem(await act(action, 'tasks', key, solene), 404, 'organization.not-found');
      }
      for (const path of ['/internal/v1/archives/lists', '/internal/v1/archives/tasks']) {
        expectProblem(await send('get', path, solene), 404, 'organization.not-found');
      }
      expect(await outboxTotal()).toBe(total);

      const ownLists = await read(
        ListArchivedListsInternalResponse,
        '/internal/v1/archives/lists',
        solene,
        { limit: 100 },
        delta,
      );
      expect(ownLists).toEqual({
        items: [{ list: deltaList, taskCount: 0 }],
        nextCursor: null,
        total: 1,
      });
      const ownTasks = await read(
        ListArchivedTasksInternalResponse,
        '/internal/v1/archives/tasks',
        solene,
        { limit: 100 },
        delta,
      );
      expect(ownTasks.items.map((item) => item.task.key)).toEqual([deltaTask.key]);
      expect(ownTasks.total).toBe(1);

      expect(await readList(campaign.id)).toEqual(campaign);
      expect(await readTask(oldVisual.key)).toEqual(oldVisual);
    });

    it('keeps the archived rows of Atelier Nord out of a tenant transaction of the second organization, as task_app', async () => {
      for (const table of ['tasks', 'lists'] as const) {
        const [stored] = await asSystem<{ readonly total: number }>(
          `select count(*)::int as total from ${table} where organization_id = $1 and archived_at is not null`,
          [atelierNordId],
        );
        expect(stored?.total, table).toBeGreaterThan(0);

        const seen = await inTenant(atelierDeltaId, async (client) => {
          const role = await client.query('select current_user::text as role');
          const rows = await client.query(
            `select organization_id::text as organization_id, id::text as id from ${table}
              where archived_at is not null`,
          );
          const ofAtelierNord = await client.query(
            `select count(*)::int as total from ${table}
              where organization_id = $1 and archived_at is not null`,
            [atelierNordId],
          );
          return {
            role: (role.rows as readonly { readonly role: string }[])[0]?.role,
            rows: rows.rows as readonly { readonly organization_id: string; readonly id: string }[],
            ofAtelierNord: ofAtelierNord.rows as readonly { readonly total: number }[],
          };
        });
        expect(seen.role).toBe('task_app');
        expect(
          seen.rows.map((row) => row.organization_id),
          table,
        ).toEqual([atelierDeltaId]);
        expect(
          seen.rows.map((row) => row.id),
          table,
        ).toEqual([table === 'tasks' ? await taskIdOf(deltaTask.key) : deltaList.id]);
        expect(seen.ofAtelierNord, table).toEqual([{ total: 0 }]);
      }
    });
  });

  describe('the constraints keep an archive in its organization and its root flag with its root', () => {
    it('refuses, as task_app in a tenant transaction of Atelier Nord, a root of the second organization by the composite foreign key and row-level security, and an archive_root that disagrees with archive_root_id by tasks_archive_root_check', async () => {
      const [delta] = await asSystem<{ readonly id: string }>(
        'select id::text as id from tasks where organization_id = $1 order by id limit 1',
        [atelierDeltaId],
      );
      const deltaTaskId = delta?.id ?? '';
      expect(deltaTaskId).not.toBe('');
      const liveId = await taskIdOf(gridUpdate.key);
      const rootId = await taskIdOf(oldVisual.key);
      const stored = async (): Promise<unknown[]> =>
        asSystem(
          `select id::text as id, organization_id::text as organization_id, version, archived_at,
                  archived_by_type, archived_by_id, archive_root_id::text as archive_root_id, archive_root
             from tasks where id = any($1::uuid[]) order by id`,
          [[liveId, rootId]],
        );
      const before = await stored();
      const archive = `archived_at = now(), archived_by_type = 'user', archived_by_id = '${camille.userId}'`;
      const attempts: readonly (readonly [string, string, readonly unknown[]])[] = [
        [
          'a live task archived under a root of the second organization',
          `update tasks set ${archive}, archive_root_id = $2 where organization_id = $1 and id = $3`,
          [atelierNordId, deltaTaskId, liveId],
        ],
        [
          'the same task moved into the second organization with that root',
          `update tasks set organization_id = $2, ${archive}, archive_root_id = $3
            where organization_id = $1 and id = $4`,
          [atelierNordId, atelierDeltaId, deltaTaskId, liveId],
        ],
        [
          'archive_root set on a live task, without archive_root_id',
          'update tasks set archive_root = true where organization_id = $1 and id = $2',
          [atelierNordId, liveId],
        ],
        [
          'a task archived as its own root, without archive_root',
          `update tasks set ${archive}, archive_root_id = id where organization_id = $1 and id = $2`,
          [atelierNordId, liveId],
        ],
        [
          'archive_root cleared on the root of an archive',
          'update tasks set archive_root = false where organization_id = $1 and id = $2',
          [atelierNordId, rootId],
        ],
      ];

      const outcome = await inTenant(atelierNordId, async (client) => {
        const role = await client.query('select current_user::text as role');
        const refusals: {
          readonly attempt: string;
          readonly code?: string;
          readonly constraint?: string;
          readonly accepted?: true;
        }[] = [];
        for (const [attempt, text, params] of attempts) {
          await client.query('savepoint attempt');
          try {
            await client.query(text, [...params]);
            refusals.push({ attempt, accepted: true });
          } catch (error) {
            const { code, constraint } = error as { code?: string; constraint?: string };
            refusals.push({ attempt, code, constraint });
          }
          await client.query('rollback to savepoint attempt');
        }
        return {
          role: (role.rows as readonly { readonly role: string }[])[0]?.role,
          refusals,
        };
      });

      expect(outcome.role).toBe('task_app');
      expect(outcome.refusals).toEqual([
        {
          attempt: attempts[0]?.[0],
          code: '23503',
          constraint: 'tasks_archive_root_fkey',
        },
        { attempt: attempts[1]?.[0], code: '42501', constraint: undefined },
        {
          attempt: attempts[2]?.[0],
          code: '23514',
          constraint: 'tasks_archive_root_check',
        },
        {
          attempt: attempts[3]?.[0],
          code: '23514',
          constraint: 'tasks_archive_root_check',
        },
        {
          attempt: attempts[4]?.[0],
          code: '23514',
          constraint: 'tasks_archive_root_check',
        },
      ]);
      expect(await stored()).toEqual(before);
    });
  });

  describe('an archived list or task the actor does not see answers exactly as an unknown one', () => {
    /**
     * The problem of a refusal, without `instance`, which names the path.
     *
     * @param response - A supertest response.
     * @returns The members of the problem.
     */
    function problemOf(response: request.Response): Readonly<Record<string, unknown>> {
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/u);
      return Object.fromEntries(
        Object.entries(bodyOf(response) as Readonly<Record<string, unknown>>).filter(
          ([member]) => member !== 'instance',
        ),
      );
    }

    /**
     * Calls each route for a target the actor does not see and for an unknown one, and checks both
     * answer the same problem: its status, its code, its other members, and no `details`.
     *
     * @param routes - Verb, path with `{id}` for the target, and issuer of each route.
     * @param actor - Who calls.
     * @param unseen - The target the actor has no role on.
     * @param unknown - A target that does not exist.
     * @param status - The status both answer.
     * @param code - The code both answer.
     */
    async function expectAsUnknown(
      routes: readonly (readonly [HttpMethod, string, Issuer])[],
      actor: Person,
      unseen: string,
      unknown: string,
      status: number,
      code: string,
    ): Promise<void> {
      for (const [method, path, issuer] of routes) {
        const options: SendOptions = method === 'post' ? { body: {}, issuer } : { issuer };
        const label = `${method} ${path}`;
        const ofUnseen = await send(method, path.replace('{id}', unseen), actor, options);
        const ofUnknown = await send(method, path.replace('{id}', unknown), actor, options);
        expect(ofUnseen.status, `${label}: ${ofUnseen.text}`).toBe(status);
        expect(ofUnknown.status, `${label}: ${ofUnknown.text}`).toBe(status);
        const problem = problemOf(ofUnseen);
        expect(problem, label).toMatchObject({ status, code });
        expect(problem, label).not.toHaveProperty('details');
        expect(problem, label).toEqual(problemOf(ofUnknown));
      }
    }

    it('answers 404 list.not-found to Chloé (a guest without a grant) and Léa (a member, the list closed to the organization) on every route of an archived list, as for an unknown list, and changes nothing', async () => {
      const total = await outboxTotal();
      const before = [await readList(campaign.id), await readList(budget.id)];
      const routes: readonly (readonly [HttpMethod, string, Issuer])[] = [
        ['get', '/internal/v1/lists/{id}', 'api-gateway'],
        ['get', '/internal/v1/lists/{id}/tasks?limit=10', 'api-gateway'],
        ['get', `/internal/v1/lists/{id}/counts?today=${today}`, 'api-gateway'],
        ['get', '/internal/v1/lists/{id}/task-groups?groupBy=status', 'api-gateway'],
        ['get', '/internal/v1/lists/{id}/activity', 'api-gateway'],
        ['post', '/internal/v1/lists/{id}/archive', 'api-gateway'],
        ['post', '/internal/v1/lists/{id}/unarchive', 'api-gateway'],
        ['get', '/internal/v1/lists/{id}/access', 'realtime-gateway'],
      ];

      for (const [actor, list] of [
        [chloe, campaign],
        [lea, budget],
      ] as const) {
        expect(list.archivedAt).not.toBeNull();
        await expectAsUnknown(routes, actor, list.id, randomUUID(), 404, 'list.not-found');
      }

      expect([await readList(campaign.id), await readList(budget.id)]).toEqual(before);
      expect(await outboxTotal()).toBe(total);
    });

    it('answers 404 task.not-found to them on every route of an archived task, in a live list or an archived one, as for an unknown key of the same space, and changes nothing', async () => {
      const total = await outboxTotal();
      const routes: readonly (readonly [HttpMethod, string, Issuer])[] = [
        ['get', '/internal/v1/tasks/{id}', 'api-gateway'],
        ['get', '/internal/v1/tasks/{id}/detail', 'api-gateway'],
        ['get', '/internal/v1/tasks/{id}/subtasks', 'api-gateway'],
        ['get', '/internal/v1/tasks/{id}/activity', 'api-gateway'],
        ['post', '/internal/v1/tasks/{id}/archive', 'api-gateway'],
        ['post', '/internal/v1/tasks/{id}/unarchive', 'api-gateway'],
        ['get', '/internal/v1/tasks/{id}/access', 'realtime-gateway'],
      ];

      for (const [actor, task] of [
        [chloe, calendar],
        [chloe, oldVisual],
        [lea, boothCost],
      ] as const) {
        expect(task.archivedAt).not.toBeNull();
        await expectAsUnknown(routes, actor, task.key, 'MKT-99999', 404, 'task.not-found');
      }

      for (const task of [calendar, oldVisual, boothCost]) {
        expect(await readTask(task.key)).toEqual(task);
      }
      expect(await outboxTotal()).toBe(total);
    });
  });

  describe('restoring a task needs edit on its list, also when the list is archived', () => {
    it('refuses Nadia, who views the archived « Salon 2026 », the restoration of « Réserver le stand » with 403 access.role-insufficient before 412, and leaves the list and the task archived without an event', async () => {
      const total = await outboxTotal();
      const listEvents = (await outboxOf('listId', fair.id)).length;
      expect(await readList(fair.id, nadia)).toMatchObject({
        callerRole: 'view',
        archivedAt: fair.archivedAt,
      });

      for (const headers of [{}, stale]) {
        expectProblem(
          await act('unarchive', 'tasks', booth.key, nadia, { headers }),
          403,
          'access.role-insufficient',
          { role: 'view', requiredRole: 'edit' },
        );
      }

      expect(await readList(fair.id)).toEqual(fair);
      expect(await readTask(booth.key)).toEqual(booth);
      const events = await outboxOf('listId', fair.id);
      expect(events).toHaveLength(listEvents);
      expect(events.map((event) => event.event_name)).not.toContain('list.unarchived.v1');
      expect(events.map((event) => event.event_name)).not.toContain('task.unarchived.v1');
      expect(await outboxTotal()).toBe(total);
    });
  });

  describe('a cursor of the pages "Archives" reused after the loss of a grant skips what is no longer seen', () => {
    it('leaves « Salon 2026 » and « Réserver le stand » out of the next page of Lucie once her grant is removed, and drops the totals', async () => {
      for (const list of [campaign, fair, budget]) {
        await grant(camille, 'lists', list.id, lucie.userId, 'view');
      }
      const lists = await archivedListsOf(lucie, { limit: 1 });
      const tasks = await archivedTasksOf(lucie, { limit: 1 });
      expect(lists).toMatchObject({ total: 3 });
      expect(lists.items.map((item) => item.list.id)).toEqual([budget.id]);
      expect(lists.nextCursor).not.toBeNull();
      expect(tasks).toMatchObject({ total: 3 });
      expect(tasks.items.map((item) => item.task.key)).toEqual([boothCost.key]);
      expect(tasks.nextCursor).not.toBeNull();
      // Without the loss, the next pages would hold « Salon 2026 » and « Réserver le stand ».
      expect(
        (await archivedListsOf(lucie, { limit: 1, cursor: lists.nextCursor ?? '' })).items.map(
          (item) => item.list.id,
        ),
      ).toEqual([fair.id]);
      expect(
        (await archivedTasksOf(lucie, { limit: 1, cursor: tasks.nextCursor ?? '' })).items.map(
          (item) => item.task.key,
        ),
      ).toEqual([booth.key]);

      const removed = await send(
        'delete',
        `/internal/v1/lists/${fair.id}/grants/${lucie.userId}`,
        camille,
      );
      expect(removed.status, removed.text).toBe(204);

      const nextLists = await archivedListsOf(lucie, {
        limit: 1,
        cursor: lists.nextCursor ?? '',
      });
      expect(nextLists).toMatchObject({ total: 2, nextCursor: null });
      expect(nextLists.items.map((item) => item.list.id)).toEqual([campaign.id]);
      const nextTasks = await archivedTasksOf(lucie, {
        limit: 1,
        cursor: tasks.nextCursor ?? '',
      });
      expect(nextTasks).toMatchObject({ total: 2, nextCursor: null });
      expect(nextTasks.items.map((item) => item.task.key)).toEqual([oldVisual.key]);
      expectProblem(
        await send('get', `/internal/v1/lists/${fair.id}`, lucie),
        404,
        'list.not-found',
      );
    });
  });

  describe('the overview pages the lists of a space in the order of the sidebar, a restored list last', () => {
    it('pages « Support » by two: « Tickets entrants » and « Base de connaissances » first, then « Première liste », restored from the archives, with listCount 3 on both pages', async () => {
      const support = await createSpace(camille, { name: 'Support', prefix: 'SUP' });
      const first = support.firstList;
      const tickets = await createList(camille, support.space.id, { name: 'Tickets entrants' });
      const knowledge = await createList(camille, support.space.id, {
        name: 'Base de connaissances',
      });
      await createTask(camille, first.id, { name: 'Répondre aux tickets en attente' });
      await createTask(camille, tickets.id, { name: 'Trier les tickets du jour' });
      await archiveList(first.id);
      const restored = await unarchiveList(first.id);
      const path = `/internal/v1/spaces/${support.space.id}/overview`;

      const pageOne = await read(GetSpaceOverviewInternalResponse, path, camille, {
        today,
        limit: 2,
      });
      const pageTwo = await read(GetSpaceOverviewInternalResponse, path, camille, {
        today,
        limit: 2,
        cursor: pageOne.nextCursor ?? '',
      });

      expect(pageOne.items.map((item) => item.list.id)).toEqual([tickets.id, knowledge.id]);
      expect(pageOne).toMatchObject({ listCount: 3, taskCount: 2 });
      expect(pageOne.nextCursor).not.toBeNull();
      expect(pageTwo.items.map((item) => item.list.id)).toEqual([first.id]);
      expect(pageTwo.items[0]?.list).toEqual(restored);
      expect(pageTwo).toMatchObject({ listCount: 3, taskCount: 2, nextCursor: null });
      expect(await listNamesOf(support.space.id)).toEqual([
        'Tickets entrants',
        'Base de connaissances',
        'Première liste',
      ]);
    });
  });

  describe('concurrent archives and restorations end in one consistent state, without a deadlock', () => {
    /**
     * Counts the lock requests of the cluster that wait, as `pg_locks` shows them to any role.
     *
     * @returns The number of locks not granted.
     */
    async function lockWaits(): Promise<number> {
      const [row] = await asSystem<{ readonly total: number }>(
        'select count(*)::int as total from pg_locks where not granted',
      );
      return row?.total ?? 0;
    }

    /**
     * Holds the row of a task `FOR UPDATE` in a transaction of the migrator role, as a concurrent
     * writer would, starts the first call and waits until it waits for a lock, starts the second
     * and waits again, then releases the row: the calls meet in the order they were started, well
     * under the `lock_timeout` of `task_app` (5 s).
     *
     * @param key - The task whose row is held.
     * @param first - The call that queues first.
     * @param second - The call that queues behind it.
     * @returns Both responses, in the order of the calls.
     */
    async function inOrderBehind(
      key: string,
      first: () => Promise<request.Response>,
      second: () => Promise<request.Response>,
    ): Promise<[request.Response, request.Response]> {
      const blocker = await migrator.connect();
      let released = false;
      try {
        await blocker.query('begin');
        await blocker.query(`select set_config('app.system_access', 'on', true)`);
        await blocker.query(
          `select 1 from tasks
            where organization_id = $1 and key_prefix = split_part($2, '-', 1)
              and key_number = split_part($2, '-', 2)::int
            for update`,
          [atelierNordId, key],
        );
        const waitsBefore = await lockWaits();
        const firstCall = first();
        await vi.waitFor(
          async () => {
            expect(await lockWaits()).toBeGreaterThanOrEqual(waitsBefore + 1);
          },
          { timeout: 3_000, interval: 20 },
        );
        const secondCall = second();
        await vi.waitFor(
          async () => {
            expect(await lockWaits()).toBeGreaterThanOrEqual(waitsBefore + 2);
          },
          { timeout: 3_000, interval: 20 },
        );
        await blocker.query('rollback');
        released = true;
        return await Promise.all([firstCall, secondCall]);
      } finally {
        if (!released) {
          await blocker.query('rollback');
        }
        blocker.release();
      }
    }

    it('restores one archive through two of its members at once: both answer 200, one restores and the other answers the restored task', async () => {
      const translations = await createTask(camille, refonte.id, { name: 'Traductions du site' });
      const english = await createSubtask(translations.key, { name: 'Traductions anglaises' });
      const legal = await createSubtask(english.key, { name: 'Pages légales en anglais' });
      const members = [translations.key, english.key, legal.key];
      const restoreRoot = (): Promise<request.Response> =>
        act('unarchive', 'tasks', translations.key, camille);
      const restoreLeaf = (): Promise<request.Response> =>
        act('unarchive', 'tasks', legal.key, camille);
      const rounds = [
        // The leaf locks the archive first: it restores it and answers the root; the root then
        // finds its archive restored and answers itself, live.
        { name: 'leaf first', calls: () => inOrderBehind(legal.key, restoreLeaf, restoreRoot) },
        // The root locks it first: the leaf then finds its archive restored and answers itself.
        {
          name: 'root first',
          calls: async (): Promise<[request.Response, request.Response]> => {
            const [byRoot, byLeaf] = await inOrderBehind(legal.key, restoreRoot, restoreLeaf);
            return [byLeaf, byRoot];
          },
        },
        // Unforced, as two gateways would send them.
        {
          name: 'free',
          calls: () => Promise.all([restoreLeaf(), restoreRoot()]),
        },
      ];
      const leafAnswers: string[] = [];

      for (const round of rounds) {
        await archiveTask(translations.key);
        const archived = new Map<string, number>();
        for (const key of members) {
          archived.set(key, (await readTask(key)).version);
        }
        const eventsBefore = (await outboxOf('rootKey', translations.key)).length;

        const [byLeaf, byRoot] = await round.calls();

        const rootAnswer = taskAnswer(byRoot, UnarchiveTaskInternalResponse);
        const leafAnswer = taskAnswer(byLeaf, UnarchiveTaskInternalResponse);
        expect(rootAnswer.key, round.name).toBe(translations.key);
        leafAnswers.push(`${round.name}: ${leafAnswer.key}`);
        for (const answer of [rootAnswer, leafAnswer]) {
          expect(answer, round.name).toMatchObject({
            archivedAt: null,
            version: (archived.get(answer.key) ?? 0) + 1,
          });
        }
        for (const key of members) {
          expect(await readTask(key), `${round.name} ${key}`).toMatchObject({
            archivedAt: null,
            version: (archived.get(key) ?? 0) + 1,
          });
        }
        expect(await unarchivedSince(translations.key, eventsBefore), round.name).toEqual([
          { key: translations.key, rootKey: translations.key, parentKey: null },
          { key: english.key, rootKey: translations.key, parentKey: translations.key },
          { key: legal.key, rootKey: translations.key, parentKey: english.key },
        ]);
      }
      expect(leafAnswers.slice(0, 2)).toEqual([
        `leaf first: ${translations.key}`,
        `root first: ${legal.key}`,
      ]);
    });

    it('archives a subtask created while the archive waited for its parent: the creation that takes the parent first is archived with it', async () => {
      const batch = await createTask(camille, refonte.id, { name: 'Lot de recette' });
      const preparation = await createSubtask(batch.key, { name: 'Préparer le lot de recette' });

      const [created, archived] = await inOrderBehind(
        preparation.key,
        () =>
          send('post', `/internal/v1/tasks/${preparation.key}/subtasks`, camille, {
            body: { name: 'Finitions du lot de recette' },
          }),
        () => act('archive', 'tasks', batch.key, camille),
      );

      expect(created.status, created.text).toBe(201);
      const subtask = conforms(CreateSubtaskInternalResponse, bodyOf(created));
      const root = taskAnswer(archived, ArchiveTaskInternalResponse);
      expect(root.archivedAt).not.toBeNull();
      expect(await readTask(subtask.key)).toMatchObject({
        parentKey: preparation.key,
        archivedAt: root.archivedAt,
        version: subtask.version + 1,
      });
      expect([...(await archiveRootsOf([await taskIdOf(subtask.key)])).values()]).toEqual([
        await taskIdOf(batch.key),
      ]);
      expect(
        (await outboxOf('rootKey', batch.key)).map(
          (row) => conforms(taskEventSchemas['task.archived.v1'], row.payload).key,
        ),
      ).toEqual([batch.key, preparation.key, subtask.key]);
    });

    it('refuses a subtask creation that waited for a parent an archive took first with 409 task.archived', async () => {
      const batch = await createTask(camille, refonte.id, { name: 'Lot de production' });
      const preparation = await createSubtask(batch.key, { name: 'Préparer le lot de production' });

      const [archived, created] = await inOrderBehind(
        preparation.key,
        () => act('archive', 'tasks', batch.key, camille),
        () =>
          send('post', `/internal/v1/tasks/${preparation.key}/subtasks`, camille, {
            body: { name: 'Finitions du lot de production' },
          }),
      );

      const root = taskAnswer(archived, ArchiveTaskInternalResponse);
      expectProblem(created, 409, 'task.archived', { key: preparation.key });
      expect((await readTask(preparation.key)).archivedAt).toBe(root.archivedAt);
      expect(await subtasksOf(preparation.key)).toEqual({ keys: [], total: 0 });
    });

    it('races an archive with a subtask creation, unforced: the subtask is archived with it or the creation answers 409, and no live task is left under an archived one', async () => {
      for (let round = 1; round <= 4; round += 1) {
        const batch = await createTask(camille, refonte.id, { name: `Lot ${String(round)}` });
        const preparation = await createSubtask(batch.key, {
          name: `Lot ${String(round)} : préparation`,
        });

        const [archived, created] = await Promise.all([
          act('archive', 'tasks', batch.key, camille),
          send('post', `/internal/v1/tasks/${preparation.key}/subtasks`, camille, {
            body: { name: `Lot ${String(round)} : finitions` },
          }),
        ]);

        const root = taskAnswer(archived, ArchiveTaskInternalResponse);
        if (created.status === 201) {
          const subtask = conforms(CreateSubtaskInternalResponse, bodyOf(created));
          expect((await readTask(subtask.key)).archivedAt).toBe(root.archivedAt);
        } else {
          expectProblem(created, 409, 'task.archived', { key: preparation.key });
        }
        expect((await readTask(preparation.key)).archivedAt).toBe(root.archivedAt);
      }

      // A live task never has an archived parent, whatever the order the writers met in.
      const [orphans] = await asSystem<{ readonly total: number }>(
        `select count(*)::int as total from tasks child
           join tasks parent
             on parent.organization_id = child.organization_id and parent.id = child.parent_id
          where child.organization_id = $1 and child.archived_at is null
            and parent.archived_at is not null`,
        [atelierNordId],
      );
      expect(orphans?.total).toBe(0);
    });

    describe('an archive racing the move of a descendant out of its list takes the descendant whole or leaves it live', () => {
      /** A task of a round, as stored. */
      interface StoredTask {
        readonly key: string;
        readonly list_id: string;
        readonly parent_key: string | null;
        readonly archived_at: Date | null;
        readonly archive_root_key: string | null;
      }

      /** Sends the archive and the move of a round, and answers them in that order. */
      type Race = (
        held: string,
        archive: () => Promise<request.Response>,
        move: () => Promise<request.Response>,
      ) => Promise<readonly [request.Response, request.Response]>;

      /**
       * Reads tasks as stored, by key.
       *
       * @param keys - The tasks.
       * @returns Each task, by key.
       */
      async function storedTasks(keys: readonly string[]): Promise<Map<string, StoredTask>> {
        const rows = await asSystem<StoredTask>(
          `select t.key_prefix || '-' || t.key_number as key, t.list_id::text as list_id,
                  p.key_prefix || '-' || p.key_number as parent_key, t.archived_at,
                  r.key_prefix || '-' || r.key_number as archive_root_key
             from tasks as t
             left join tasks as p on p.organization_id = t.organization_id and p.id = t.parent_id
             left join tasks as r on r.organization_id = t.organization_id and r.id = t.archive_root_id
            where t.organization_id = $1 and t.key_prefix || '-' || t.key_number = any($2::text[])`,
          [atelierNordId, keys],
        );
        return new Map(rows.map((row) => [row.key, row]));
      }

      it('races the archive of « Lot de traduction » with the move of its subtask « Traduire les emails » and its own subtask to « Maintenance du site »: the move commits first and stays live, or answers 409 and is archived with the rest', async () => {
        const unforced: Race = async (_held, archive, move) => Promise.all([archive(), move()]);
        const unforcedMoveSent: Race = async (_held, archive, move) => {
          const [byMove, byArchive] = await Promise.all([move(), archive()]);
          return [byArchive, byMove];
        };
        const rounds: readonly (readonly [string, 'moved' | 'archived' | null, Race])[] = [
          // The archive waits for the held subtask while it locks the subtree, the move behind it:
          // the archive takes the subtask, and the move then reads it archived.
          [
            'archive first',
            'archived',
            async (held, archive, move) => inOrderBehind(held, archive, move),
          ],
          // The move waits for its task first: it commits, and the archive locks the subtask after
          // it left the subtree.
          [
            'move first',
            'moved',
            async (held, archive, move) => {
              const [byMove, byArchive] = await inOrderBehind(held, move, archive);
              return [byArchive, byMove];
            },
          ],
          // Unforced, as two gateways would send them.
          ['unforced 1', null, unforced],
          ['unforced 2', null, unforcedMoveSent],
          ['unforced 3', null, unforced],
          ['unforced 4', null, unforcedMoveSent],
        ];
        const outcomes: string[] = [];

        for (const [index, [name, expected, race]] of rounds.entries()) {
          const round = String(index + 1);
          const batch = await createTask(camille, refonte.id, {
            name: `Lot de traduction ${round}`,
          });
          const pages = await createSubtask(batch.key, { name: `Traduire les pages ${round}` });
          const mails = await createSubtask(batch.key, { name: `Traduire les emails ${round}` });
          const subject = await createSubtask(mails.key, {
            name: `Traduire les objets ${round}`,
          });

          const [archived, moved] = await race(
            mails.key,
            () => act('archive', 'tasks', batch.key, camille),
            () =>
              send('patch', `/internal/v1/tasks/${mails.key}`, camille, {
                body: { listId: maintenance.id },
              }),
          );

          const root = taskAnswer(archived, ArchiveTaskInternalResponse);
          const rows = await storedTasks([batch.key, pages.key, mails.key, subject.key]);
          const archivedAt = instantOf(root.archivedAt);
          const asArchived = (key: string, parentKey: string | null): void => {
            const row = rows.get(key);
            expect(row, `${name}: ${key}`).toMatchObject({
              list_id: refonte.id,
              parent_key: parentKey,
              archive_root_key: batch.key,
            });
            expect(row?.archived_at?.getTime(), `${name}: ${key}`).toBe(archivedAt);
          };
          asArchived(batch.key, null);
          asArchived(pages.key, batch.key);
          const outcome = moved.status === 200 ? 'moved' : 'archived';
          outcomes.push(`${name}: ${outcome}`);
          if (expected !== null) {
            expect(outcome, name).toBe(expected);
          }
          if (outcome === 'moved') {
            expect(conforms(UpdateTaskInternalResponse, bodyOf(moved))).toMatchObject({
              key: mails.key,
              listId: maintenance.id,
              parentKey: null,
              archivedAt: null,
            });
            expect(rows.get(mails.key), name).toMatchObject({
              list_id: maintenance.id,
              parent_key: null,
              archived_at: null,
              archive_root_key: null,
            });
            expect(rows.get(subject.key), name).toMatchObject({
              list_id: maintenance.id,
              parent_key: mails.key,
              archived_at: null,
              archive_root_key: null,
            });
            expect(root.subtaskCounts.total, name).toBe(1);
          } else {
            expectProblem(moved, 409, 'task.archived', { key: mails.key });
            asArchived(mails.key, batch.key);
            asArchived(subject.key, mails.key);
            expect(root.subtaskCounts.total, name).toBe(2);
          }
          const events = (await outboxOf('rootKey', batch.key)).map(
            (row) => conforms(taskEventSchemas['task.archived.v1'], row.payload).key,
          );
          expect(events, name).toEqual(
            outcome === 'moved'
              ? [batch.key, pages.key]
              : [batch.key, pages.key, mails.key, subject.key],
          );
        }
        console.info(`archive racing a move out of its list: ${outcomes.join(', ')}`);

        // Whatever the order: no live task under an archived one, and every member of an archive
        // carries the instant, the actor and the list of its root, under a parent of the same
        // archive.
        const [broken] = await asSystem<{
          readonly orphans: number;
          readonly split: number;
          readonly detachedMembers: number;
        }>(
          `select
             (select count(*)::int from tasks as child
                join tasks as parent on parent.organization_id = child.organization_id and parent.id = child.parent_id
               where child.organization_id = $1 and child.archived_at is null and parent.archived_at is not null) as orphans,
             (select count(*)::int from tasks as member
                join tasks as root on root.organization_id = member.organization_id and root.id = member.archive_root_id
               where member.organization_id = $1
                 and (member.archived_at <> root.archived_at or member.archived_by_id <> root.archived_by_id
                      or member.list_id <> root.list_id)) as split,
             (select count(*)::int from tasks as member
                left join tasks as parent on parent.organization_id = member.organization_id and parent.id = member.parent_id
               where member.organization_id = $1 and member.archive_root_id is not null
                 and member.archive_root_id <> member.id
                 and parent.archive_root_id is distinct from member.archive_root_id) as "detachedMembers"`,
          [atelierNordId],
        );
        expect(broken).toEqual({ orphans: 0, split: 0, detachedMembers: 0 });
      });
    });
  });

  // The clocks of the spaces and tasks transactions truncate `now()` to the millisecond as the
  // outbox writer stamps `occurredAt`; rounding instead (the first version of PR 2) made half of
  // the archives one millisecond after their event. Twenty archives catch a regression with odds
  // above 99.9999 %.
  describe('the outbox stamps an archive with the archivedAt it stores', () => {
    it('stamps list.archived.v1 and task.archived.v1 with the exact archivedAt of the list and of the task', async () => {
      const quality = await createSpace(camille, { name: 'Qualité', prefix: 'QUA' });
      const list = quality.firstList;
      const task = await createTask(camille, list.id, { name: 'Contrôle des horodatages' });
      const stamps: {
        readonly archivedAt: string | null | undefined;
        readonly occurredAt: string;
      }[] = [];

      for (let round = 0; round < 10; round += 1) {
        const archivedList = await archiveList(list.id);
        const listEvent = (await outboxOf('listId', list.id))
          .filter((row) => row.event_name === 'list.archived.v1')
          .at(-1);
        stamps.push({
          archivedAt: archivedList.archivedAt,
          occurredAt: conforms(taskEventSchemas['list.archived.v1'], listEvent?.payload).occurredAt,
        });
        await unarchiveList(list.id);
        const archivedTask = await archiveTask(task.key);
        const taskEvent = (await outboxOf('key', task.key))
          .filter((row) => row.event_name === 'task.archived.v1')
          .at(-1);
        stamps.push({
          archivedAt: archivedTask.archivedAt,
          occurredAt: conforms(taskEventSchemas['task.archived.v1'], taskEvent?.payload).occurredAt,
        });
        await unarchiveTask(task.key);
      }

      expect(
        stamps.filter((stamp) => instantOf(stamp.archivedAt) !== instantOf(stamp.occurredAt)),
      ).toEqual([]);
    });
  });

  describe('a restoration appends its events in the trace of its request', () => {
    it('stamps list.unarchived.v1 and the task.unarchived.v1 of one restoration with one traceparent, in another trace than the archives before it', async () => {
      const press = await createList(camille, marketing.space.id, { name: 'Relations presse' });
      const kit = await createTask(camille, press.id, {
        name: 'Dossier de presse 2026',
        subtasks: [{ name: 'Communiqué de lancement' }],
      });
      await archiveTask(kit.key);
      await archiveList(press.id);
      const before = (await outboxOf('listId', press.id)).length;

      await unarchiveTask(kit.key);

      const rows = await asSystem<{
        readonly event_name: string;
        readonly traceparent: string | null;
      }>(
        `select event_name, traceparent from outbox_events where payload ->> 'listId' = $1 order by id`,
        [press.id],
      );
      const restoration = rows.slice(before);
      expect(restoration.map((row) => row.event_name)).toEqual([
        'list.unarchived.v1',
        'task.unarchived.v1',
        'task.unarchived.v1',
      ]);
      for (const row of restoration) {
        expect(row.traceparent, row.event_name).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/u);
      }
      const traceparents = new Set(restoration.map((row) => row.traceparent));
      console.info(`traceparents of one restoration: ${[...traceparents].join(', ')}`);
      expect(traceparents.size).toBe(1);
      const [traceparent] = [...traceparents];
      const traceId = traceparent?.split('-')[1];
      // The creations, the archive of the task and the archive of the list are other requests.
      const earlier = rows.slice(0, before);
      expect(earlier.map((row) => row.event_name)).toEqual([
        'list.created.v1',
        'task.created.v1',
        'task.created.v1',
        'task.archived.v1',
        'task.archived.v1',
        'list.archived.v1',
      ]);
      for (const row of earlier) {
        expect(row.traceparent, row.event_name).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/u);
        expect(row.traceparent?.split('-')[1], row.event_name).not.toBe(traceId);
      }
    });
  });

  // « Reprise de l’existant » in « Reprise des données », the largest tree the rules allow: the
  // root, 25 subtasks and 25 subtasks under each, seeded through the routes (each subtask created
  // with its 25 subtasks, then attached under the root), so that the keys come from `space_prefixes`.
  describe('an archive and a restoration of a full tree of 651 tasks keep to their bounds', () => {
    /** The full tree: the root, 25 subtasks and 625 below them. */
    const treeSize = 1 + 25 + 25 * 25;

    /** What one request sent to PostgreSQL. */
    interface RequestCost {
      readonly statements: number;
      readonly control: number;
      readonly outboxAppends: number;
      readonly others: number;
      readonly connections: number;
      readonly milliseconds: number;
    }

    /**
     * Sends a request and measures the PostgreSQL work issued under its verified actor. System
     * jobs also use the application pool, so the pool alone cannot identify the request's clients.
     *
     * @param call - The request.
     * @param actor - The user issuing the request.
     * @returns The response and what it cost.
     */
    async function measure(
      call: () => Promise<request.Response>,
      actor: Person,
    ): Promise<{ readonly response: request.Response; readonly cost: RequestCost }> {
      const seen: { readonly client: unknown; readonly text: string }[] = [];
      const prototype = pg.Client.prototype as unknown as {
        query: (...args: unknown[]) => unknown;
      };
      const original = prototype.query;
      prototype.query = function (this: unknown, ...args: unknown[]): unknown {
        const currentActor = getOrganizationContext()?.actor;
        if (currentActor?.type === 'user' && currentActor.id === actor.userId) {
          const first = args[0];
          seen.push({
            client: this,
            text:
              typeof first === 'string'
                ? first
                : ((first as { text?: string } | undefined)?.text ?? ''),
          });
        }
        return Reflect.apply(original, this, args);
      };
      const started = performance.now();
      let response: request.Response;
      try {
        response = await call();
      } finally {
        prototype.query = original;
      }
      const milliseconds = Math.round(performance.now() - started);
      const control =
        /^\s*(begin|commit|rollback|set |select set_config|start transaction|savepoint|release)/iu;
      const background = /outbox_events|pgboss/u;
      const ofRequest = new Set(
        seen
          .filter((statement) => !control.test(statement.text) && !background.test(statement.text))
          .map((statement) => statement.client),
      );
      const sent = seen.filter((statement) => ofRequest.has(statement.client));
      const outboxAppends = sent.filter(
        (statement) =>
          /^\s*insert into outbox_events/u.test(statement.text) ||
          /^\s*select uuidv7\(\)::text as id,\s+to_char\(now\(\)/u.test(statement.text),
      ).length;
      const controlCount = sent.filter((statement) => control.test(statement.text)).length;
      return {
        response,
        cost: {
          statements: sent.length,
          control: controlCount,
          outboxAppends,
          others: sent.length - controlCount - outboxAppends,
          connections: ofRequest.size,
          milliseconds,
        },
      };
    }

    /**
     * Reads the events of an archive, checked against the contract.
     *
     * @param name - `task.archived.v1` or `task.unarchived.v1`.
     * @param rootKey - The root of the archive.
     * @returns The keys the events name, in the order of the outbox.
     */
    async function eventKeys(
      name: 'task.archived.v1' | 'task.unarchived.v1',
      rootKey: string,
    ): Promise<string[]> {
      const rows = (await outboxOf('rootKey', rootKey)).filter((row) => row.event_name === name);
      return rows.map((row) => conforms(taskEventSchemas[name], row.payload).key);
    }

    it('archives the tree in one request, then restores it in one: every task archived then live, 651 task.archived.v1 then 651 task.unarchived.v1, two statements per event and a few dozen more', async () => {
      const reprise = await createSpace(camille, { name: 'Reprise des données', prefix: 'REP' });
      const list = reprise.firstList;
      const root = await createTask(camille, list.id, { name: 'Reprise de l’existant' });
      for (let batch = 1; batch <= 25; batch += 1) {
        const lot = await createTask(camille, list.id, {
          name: `Lot ${String(batch)}`,
          subtasks: Array.from({ length: 25 }, (_, index) => ({
            name: `Lot ${String(batch)} : fiche ${String(index + 1)}`,
          })),
        });
        await patchTask(lot.key, { parentKey: root.key });
      }
      expect((await readTask(root.key)).subtaskCounts.total).toBe(25);
      expect((await tasksOf(list.id, 'all')).total).toBe(treeSize);
      const rootId = await taskIdOf(root.key);
      const stateOfTree = async (): Promise<unknown> => {
        const [row] = await asSystem<Record<string, number>>(
          `select count(*)::int as tasks,
                  (count(*) filter (where archived_at is null))::int as live,
                  (count(*) filter (where archive_root_id = $3))::int as members,
                  (count(distinct archived_at))::int as instants,
                  (count(*) filter (where archive_root))::int as roots
             from tasks where organization_id = $1 and list_id = $2`,
          [atelierNordId, list.id, rootId],
        );
        return row;
      };

      const archive = await measure(() => act('archive', 'tasks', root.key, camille), camille);

      const archived = taskAnswer(archive.response, ArchiveTaskInternalResponse);
      expect(archived).toMatchObject({ key: root.key, subtaskCounts: { total: 25, closed: 0 } });
      expect(await stateOfTree()).toEqual({
        tasks: treeSize,
        live: 0,
        members: treeSize,
        instants: 1,
        roots: 1,
      });
      const archivedKeys = await eventKeys('task.archived.v1', root.key);
      expect(archivedKeys).toHaveLength(treeSize);
      expect(new Set(archivedKeys).size).toBe(treeSize);
      expect(archivedKeys[0]).toBe(root.key);

      const restoration = await measure(async () => {
        const [answer] = await Promise.all([
          act('unarchive', 'tasks', root.key, camille),
          asSystem('select count(*) from intake_submissions'),
        ]);
        return answer;
      }, camille);

      const restored = taskAnswer(restoration.response, UnarchiveTaskInternalResponse);
      expect(restored).toMatchObject({
        key: root.key,
        archivedAt: null,
        subtaskCounts: { total: 25, closed: 0 },
      });
      expect(await stateOfTree()).toEqual({
        tasks: treeSize,
        live: treeSize,
        members: 0,
        instants: 0,
        roots: 0,
      });
      const unarchivedKeys = await eventKeys('task.unarchived.v1', root.key);
      expect(unarchivedKeys).toHaveLength(treeSize);
      expect(unarchivedKeys[0]).toBe(root.key);
      expect(new Set(unarchivedKeys)).toEqual(new Set(archivedKeys));

      console.info(
        `full tree of ${String(treeSize)} tasks: ${JSON.stringify({ archive: archive.cost, restoration: restoration.cost })}`,
      );
      for (const [name, cost] of [
        ['archive', archive.cost],
        ['restoration', restoration.cost],
      ] as const) {
        // One outbox append per task, two round trips each; the rest does not grow with the tree.
        expect(cost.outboxAppends, name).toBe(2 * treeSize);
        expect(cost.others, name).toBeLessThan(100);
        expect(cost.connections, name).toBe(1);
        expect(cost.milliseconds, name).toBeLessThan(30_000);
      }
    }, 300_000);
  });
});
