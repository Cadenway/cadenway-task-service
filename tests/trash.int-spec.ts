import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import type {
  MemberJoinedV1,
  MemberRemovedV1,
} from '@cadenway/contracts/events/organization-service';
import { eventSchemas as taskEventSchemas } from '@cadenway/contracts/events/task-service';
import {
  AddChecklistItemInternalResponse,
  ArchiveTaskInternalResponse,
  CheckTaskAccessInternalResponse,
  CountTaskGroupsInternalResponse,
  CreateListInternalResponse,
  CreateSpaceInternalResponse,
  CreateSubtaskInternalResponse,
  CreateTaskCommentInternalResponse,
  CreateTaskInternalResponse,
  EmptyTrashInternalResponse,
  GetHomeInternalResponse,
  GetListCountsInternalResponse,
  GetListInternalResponse,
  GetSpaceOverviewInternalResponse,
  GetTaskDetailInternalResponse,
  GetTaskInternalResponse,
  ListArchivedTasksInternalResponse,
  ListLabelsInternalResponse,
  ListListActivityInternalResponse,
  ListListsInternalResponse,
  ListMyTasksInternalResponse,
  ListSpacesInternalResponse,
  ListSubtasksInternalResponse,
  ListTaskActivityInternalResponse,
  ListTasksInternalResponse,
  ListTrashInternalResponse,
  RestoreTrashEntryInternalResponse,
  SetListGrantInternalResponse,
  SetSpaceGrantInternalResponse,
  TrashTaskInternalResponse,
  UpdateTaskInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import {
  createApplication,
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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import {
  DROP_TRASHED_TASK_REQUESTS_QUEUE,
  PURGE_TRASH_QUEUE,
  TRASH_DELETED_TASKS_QUEUE,
} from '../src/config/job-queues.js';
import { PurgeTrashEntry } from '../src/modules/tasks/application/use-cases/commands/trash/purge-trash-entry/purge-trash-entry.use-case.js';
import { PurgeTrashBatch } from '../src/modules/tasks/public/trash/purge-trash-batch.js';
import { TrashDeletedListTasks } from '../src/modules/tasks/public/trash/trash-deleted-list-tasks.js';
import { ScheduleTrashPurgeHandler } from '../src/modules/deletion-lifecycle/presentation/jobs/handlers/trash/schedule-trash-purge.handler.js';

// The trash of P3b-1 (PR 3) on a disposable PostgreSQL and NATS: the deletion of a task with its
// subtasks as one trash entry, what a task in the trash is left out of and how its key answers, the
// page "Corbeille", the restoration, the erasure of one entry, "Vider la corbeille", the deletion
// of a list and of a space and the job that moves their tasks to the trash, the daily purge, the
// concurrency of these writers and the row-level security of `trash_entries`. The service runs as
// main.ts assembles it (the `task_app` role, the `task` NATS user, the pg-boss workers of the four
// queues), started from compose.dev.yaml as a throwaway Compose project on free ports, as
// tests/archives.int-spec.ts does. The members come from the copy of the memberships, fed the way
// organization-service feeds it. The routes are called with internal tokens of the API gateway and
// of the realtime gateway, and their answers are checked against the validators generated from
// `openapi/internal/task-service.yaml`; the outbox rows are checked against the schemas of
// `asyncapi/task-service.yaml`. Rows are read as the migrator role with the system access of the
// policies, since row-level security is forced on every table. The scenarios run in the order of
// the file; each builds the tasks it needs, and a few pass their entries on.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-trash-test-${String(process.pid)}`;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** A second organization, with its own owner, which must never meet a row of Atelier Nord. */
const atelierDeltaId = '01938f6e-0000-7000-8000-000000000002';

/** The date of the scenarios, inside Sprint 14. */
const today = '2026-11-08';

/** One day, the unit of the retention of the trash. */
const dayMs = 86_400_000;

/** An `If-Match` no version of the scenarios reaches. */
const stale: Readonly<Record<string, string>> = { 'If-Match': '"99"' };

/** The queues whose jobs the scenarios wait for. */
const deletionQueues: readonly string[] = [
  TRASH_DELETED_TASKS_QUEUE,
  DROP_TRASHED_TASK_REQUESTS_QUEUE,
  PURGE_TRASH_QUEUE,
];

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

/** Nadia Benali, guest of Atelier Nord, given `edit` on some lists of "Événements". */
const nadia: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c28',
  memberId: '01938f6e-9000-7000-8000-0000000000c6',
};

/** Rose Lambert, guest of Atelier Nord, given `view` on a list and nothing else. */
const rose: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2b',
  memberId: '01938f6e-9000-7000-8000-0000000000c9',
};

/** Chloé Girard, guest of Atelier Nord, who is given access to nothing. */
const chloe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2d',
  memberId: '01938f6e-9000-7000-8000-0000000000cc',
};

/** Mathis Roux, member of Atelier Nord, who leaves the organization while a task is in the trash. */
const mathis: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2a',
  memberId: '01938f6e-9000-7000-8000-0000000000c8',
};

/** Solène Garnier, owner of the second organization. */
const solene: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c29',
  memberId: '01938f6e-9000-7000-8000-0000000000c7',
};

/** Théo Garnier, member of Atelier Nord, who leaves with grants and comes back. */
const theo: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c33',
  memberId: '01938f6e-9000-7000-8000-0000000000d4',
};

/** Hugues Lemaire, member of Atelier Nord, removed while a task moves between two lists. */
const ugo: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c34',
  memberId: '01938f6e-9000-7000-8000-0000000000d6',
};

/** Vera Moreau, member of Atelier Nord, removed in the other order of the same race. */
const vera: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c35',
  memberId: '01938f6e-9000-7000-8000-0000000000d7',
};

/** Margaux Faure, member of Atelier Nord, who leaves with a grant on an empty deleted list. */
const margaux: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c36',
  memberId: '01938f6e-9000-7000-8000-0000000000d8',
};

/** Bastien Leroy, member of Atelier Nord, who leaves in the other order of the same race. */
const bastien: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c37',
  memberId: '01938f6e-9000-7000-8000-0000000000d9',
};

/** The new membership Théo Garnier gets when he joins Atelier Nord again. */
const theoAgain: Person = {
  userId: theo.userId,
  memberId: '01938f6e-9000-7000-8000-0000000000d5',
};

/** A row of `outbox_events`, as the spec reads it. */
interface OutboxRow {
  readonly id: string;
  readonly event_name: string;
  readonly payload: unknown;
}

/** The members of a payload the spec finds the outbox rows by. */
type PayloadMember = 'listId' | 'spaceId' | 'key' | 'rootKey' | 'entryId';

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
  /** The application to call, the main one by default. */
  readonly target?: NestExpressApplication;
}

/** A space and its first list, as the creation answers them. */
type SpaceCreated = z.output<typeof CreateSpaceInternalResponse>;

/** A list or a sprint, as the routes answer it. */
type ListBody = z.output<typeof GetListInternalResponse>;

/** A task, as the routes answer it. */
type TaskBody = z.output<typeof GetTaskInternalResponse>;

/** The entry a deletion answers. */
type EntryBody = z.output<typeof TrashTaskInternalResponse>;

/** What a restoration answers. */
type RestoredBody = z.output<typeof RestoreTrashEntryInternalResponse>;

/** One page of the trash. */
type TrashPageBody = z.output<typeof ListTrashInternalResponse>;

/** The overview of a space. */
type OverviewBody = z.output<typeof GetSpaceOverviewInternalResponse>;

/** A task as stored, with what the trash adds. */
interface StoredTask {
  readonly key: string;
  readonly version: number;
  readonly list_id: string;
  readonly parent_key: string | null;
  readonly archived_at: Date | null;
  readonly trash_entry_id: string | null;
}

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
 * Publishes a membership event as organization-service emits it, with the `admin` user, waiting
 * for the acknowledgement of the stream.
 *
 * @param kind - `joined` or `removed`.
 * @param organizationId - Organization of the membership.
 * @param person - The membership and its account.
 * @param role - Role of the membership.
 * @param version - Version of the membership after the event.
 * @returns The id of the event.
 */
function publishMember(
  kind: 'joined' | 'removed',
  organizationId: string,
  person: Person,
  role: MemberJoinedV1['role'],
  version: number,
): string {
  const id = randomUUID();
  const common = {
    id,
    occurredAt: new Date().toISOString(),
    organizationId,
    version,
    memberId: person.memberId,
    userId: person.userId,
    role,
  };
  const payload: MemberJoinedV1 | MemberRemovedV1 =
    kind === 'joined'
      ? { ...common, actor: { type: 'user', id: person.userId }, invitationId: null }
      : { ...common, actor: { type: 'user', id: camille.userId } };
  compose(
    'exec',
    '-T',
    'nats-streams',
    'nats',
    'pub',
    '--jetstream',
    '--header',
    `Nats-Msg-Id:${id}`,
    `evt.member.${kind}.v1`,
    JSON.stringify(payload),
  );
  return id;
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
function instantOf(value: string | Date | null | undefined): number {
  if (value === null || value === undefined) {
    throw new Error('No instant.');
  }
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

// The jobs of a deletion wait for the poll of the workers, which a loaded machine stretches.
describe('the trash of tasks, lists and spaces', { timeout: 180_000 }, () => {
  const apiGateway = keyPair('test-api-gateway');
  const realtimeGateway = keyPair('test-realtime-gateway');
  let app: NestExpressApplication | undefined;
  let telemetry: TelemetryHandle | undefined;
  const signers = new Map<Issuer, InternalTokenSigner>();
  let migrator: pg.Pool;
  const errorLines: string[] = [];
  // The jobs a scenario held, released after it whatever happened: a held job would keep the next
  // scenarios waiting for the queues to settle.
  const heldJobs: (() => Promise<void>)[] = [];

  // The fixture every scenario shares, created once the members are known.
  let produit: SpaceCreated;
  let sprint14: ListBody;
  let recherche: SpaceCreated;
  let entretiens: ListBody;
  let delta: SpaceCreated;

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
    let call = request((options.target ?? service()).getHttpServer())
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
    if (response.status >= 500) {
      // Diagnostic only: what the service logged at error level while it answered 5xx.
      console.error(`${method} ${path} answered ${String(response.status)}`, errorLines.slice(-3));
    }
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
   * Counts the rows a statement selects, as the migrator role.
   *
   * @param sql - A `select count(*)::int as total ...` statement.
   * @param params - Its parameters.
   * @returns The count.
   */
  async function countOf(sql: string, params: readonly unknown[] = []): Promise<number> {
    const [row] = await asSystem<{ readonly total: number }>(sql, params);
    return row?.total ?? 0;
  }

  /**
   * Reads the outbox rows of an event whose payload names a value, oldest first (ids come from
   * `uuidv7()`).
   *
   * @param name - The event name.
   * @param member - The member of the payload that holds the value.
   * @param value - The value.
   * @returns The rows.
   */
  async function eventsOf(
    name: string,
    member: PayloadMember,
    value: string,
  ): Promise<OutboxRow[]> {
    return asSystem<OutboxRow>(
      `select id::text as id, event_name, payload from outbox_events
        where event_name = $1 and payload ->> '${member}' = $2 order by id`,
      [name, value],
    );
  }

  /**
   * Reads every outbox row whose payload names a value, whatever the event, oldest first.
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
   * Counts every row of the outbox, so that a test can tell a call appended nothing.
   *
   * @returns The number of rows.
   */
  async function outboxTotal(): Promise<number> {
    return countOf('select count(*)::int as total from outbox_events');
  }

  /**
   * Reads the `task.trashed.v1` of an entry, checked against the contract, in the order of the
   * outbox.
   *
   * @param entryId - The entry.
   * @returns The payloads.
   */
  async function trashedOf(
    entryId: string,
  ): Promise<z.output<(typeof taskEventSchemas)['task.trashed.v1']>[]> {
    const rows = await eventsOf('task.trashed.v1', 'entryId', entryId);
    return rows.map((row) => conforms(taskEventSchemas['task.trashed.v1'], row.payload));
  }

  /**
   * Reads the `task.restored.v1` of a restoration, checked against the contract, in the order of
   * the outbox.
   *
   * @param rootKey - The key of the root of the entry.
   * @param before - How many `task.restored.v1` named that root before the restoration.
   * @returns The payloads appended since.
   */
  async function restoredSince(
    rootKey: string,
    before: number,
  ): Promise<z.output<(typeof taskEventSchemas)['task.restored.v1']>[]> {
    const rows = (await eventsOf('task.restored.v1', 'rootKey', rootKey)).slice(before);
    return rows.map((row) => conforms(taskEventSchemas['task.restored.v1'], row.payload));
  }

  /**
   * Reads the `task.purged.v1` of an entry, checked against the contract, in the order of the
   * outbox.
   *
   * @param entryId - The entry.
   * @returns The payloads.
   */
  async function purgedOf(
    entryId: string,
  ): Promise<z.output<(typeof taskEventSchemas)['task.purged.v1']>[]> {
    const rows = await eventsOf('task.purged.v1', 'entryId', entryId);
    return rows.map((row) => conforms(taskEventSchemas['task.purged.v1'], row.payload));
  }

  /**
   * Reads the id of a task by its key, as stored.
   *
   * @param key - The key.
   * @param organizationId - Organization of the task, Atelier Nord by default.
   * @returns The id.
   */
  async function taskIdOf(key: string, organizationId: string = atelierNordId): Promise<string> {
    const [row] = await asSystem<{ readonly id: string }>(
      `select id::text as id from tasks
        where organization_id = $1 and key_prefix = split_part($2, '-', 1)
          and key_number = split_part($2, '-', 2)::int`,
      [organizationId, key],
    );
    if (row === undefined) {
      throw new Error(`No task ${key}.`);
    }
    return row.id;
  }

  /**
   * Reads tasks as stored, by key; a task erased for good is missing from the map.
   *
   * @param keys - The tasks.
   * @returns Each task, by key.
   */
  async function storedTasks(keys: readonly string[]): Promise<Map<string, StoredTask>> {
    const rows = await asSystem<StoredTask>(
      `select t.key_prefix || '-' || t.key_number as key, t.version, t.list_id::text as list_id,
              p.key_prefix || '-' || p.key_number as parent_key, t.archived_at,
              t.trash_entry_id::text as trash_entry_id
         from tasks as t
         left join tasks as p on p.organization_id = t.organization_id and p.id = t.parent_id
        where t.organization_id = $1 and t.key_prefix || '-' || t.key_number = any($2::text[])`,
      [atelierNordId, keys],
    );
    return new Map(rows.map((row) => [row.key, row]));
  }

  /**
   * Reads one task as stored.
   *
   * @param key - The task.
   * @returns The task, or `undefined` once it is erased.
   */
  async function storedTask(key: string): Promise<StoredTask | undefined> {
    return (await storedTasks([key])).get(key);
  }

  /**
   * Waits until no job of the deletion queues is waiting, retrying or running: the deletions,
   * the requests of the entries and the purges have all finished.
   */
  async function jobsSettled(): Promise<void> {
    await vi.waitFor(
      async () => {
        const result = await migrator.query<{ readonly open: number }>(
          `select count(*)::int as open from pgboss.job
            where name = any($1::text[]) and state in ('created', 'retry', 'active')`,
          [deletionQueues],
        );
        expect(result.rows[0]?.open).toBe(0);
      },
      { timeout: 150_000, interval: 250 },
    );
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
    return conforms(schema, bodyOf(response));
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
    return conforms(CreateSpaceInternalResponse, bodyOf(response));
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
    return conforms(CreateListInternalResponse, bodyOf(response));
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
   * Archives a task and checks the answer.
   *
   * @param key - The task.
   * @param actor - Who archives it, Camille by default.
   * @returns The task, archived.
   */
  async function archiveTask(key: string, actor: Person = camille): Promise<TaskBody> {
    const response = await send('post', `/internal/v1/tasks/${key}/archive`, actor, { body: {} });
    expect(response.status, response.text).toBe(200);
    return conforms(ArchiveTaskInternalResponse, bodyOf(response));
  }

  /**
   * Calls the deletion of a task.
   *
   * @param key - The task.
   * @param actor - Who deletes it, Camille by default.
   * @param options - Headers and organization.
   * @returns The response.
   */
  async function trashRequest(
    key: string,
    actor: Person = camille,
    options: SendOptions = {},
  ): Promise<request.Response> {
    return send('post', `/internal/v1/tasks/${key}/trash`, actor, { body: {}, ...options });
  }

  /**
   * Checks the answer of a deletion: `200`, the contract, and a purge date exactly 30 days after
   * the deletion.
   *
   * @param response - The response.
   * @returns The entry.
   */
  function entryAnswer(response: request.Response): EntryBody {
    expect(response.status, response.text).toBe(200);
    const entry = conforms(TrashTaskInternalResponse, bodyOf(response));
    expect(instantOf(entry.purgeAt) - instantOf(entry.trashedAt)).toBe(30 * dayMs);
    return entry;
  }

  /**
   * Deletes a task and checks the answer.
   *
   * @param key - The task.
   * @param actor - Who deletes it, Camille by default.
   * @returns The entry.
   */
  async function trashTask(key: string, actor: Person = camille): Promise<EntryBody> {
    return entryAnswer(await trashRequest(key, actor));
  }

  /**
   * Calls the restoration of an entry.
   *
   * @param entryId - The entry.
   * @param actor - Who restores it, Camille by default.
   * @param options - Headers and organization.
   * @returns The response.
   */
  async function restoreRequest(
    entryId: string,
    actor: Person = camille,
    options: SendOptions = {},
  ): Promise<request.Response> {
    return send('post', `/internal/v1/trash/entries/${entryId}/restore`, actor, {
      body: {},
      ...options,
    });
  }

  /**
   * Restores an entry and checks the answer.
   *
   * @param entryId - The entry.
   * @param actor - Who restores it, Camille by default.
   * @returns What came back.
   */
  async function restoreEntry(entryId: string, actor: Person = camille): Promise<RestoredBody> {
    const response = await restoreRequest(entryId, actor);
    expect(response.status, response.text).toBe(200);
    return conforms(RestoreTrashEntryInternalResponse, bodyOf(response));
  }

  /**
   * Calls the erasure of an entry.
   *
   * @param entryId - The entry.
   * @param actor - Who erases it, Camille by default.
   * @returns The response.
   */
  async function purgeRequest(entryId: string, actor: Person = camille): Promise<request.Response> {
    return send('delete', `/internal/v1/trash/entries/${entryId}`, actor);
  }

  /**
   * Erases an entry and checks `204`.
   *
   * @param entryId - The entry.
   * @param actor - Who erases it, Camille by default.
   */
  async function purgeEntry(entryId: string, actor: Person = camille): Promise<void> {
    const response = await purgeRequest(entryId, actor);
    expect(response.status, response.text).toBe(204);
    expect(response.text).toBe('');
  }

  /**
   * Calls "Vider la corbeille".
   *
   * @param actor - Who empties the trash.
   * @param organizationId - Organization of the actor, Atelier Nord by default.
   * @returns The response.
   */
  async function emptyRequest(
    actor: Person,
    organizationId: string = atelierNordId,
  ): Promise<request.Response> {
    return send('post', '/internal/v1/trash/empty', actor, { body: {}, organizationId });
  }

  /**
   * Reads a page of the trash.
   *
   * @param actor - Who reads.
   * @param query - Cursor and limit; 100 by default.
   * @param organizationId - Organization of the actor, Atelier Nord by default.
   * @returns The page.
   */
  async function trashPageOf(
    actor: Person,
    query: Query = { limit: 100 },
    organizationId: string = atelierNordId,
  ): Promise<TrashPageBody> {
    return read(ListTrashInternalResponse, '/internal/v1/trash/entries', actor, query, {
      organizationId,
    });
  }

  /**
   * Walks every page of the trash, checking the total of each page.
   *
   * @param actor - Who reads.
   * @param limit - The size of a page.
   * @returns The entries, in the order of the pages, and the total.
   */
  async function walkTrash(
    actor: Person,
    limit: number,
  ): Promise<{ readonly items: TrashPageBody['items']; readonly total: number }> {
    const items: TrashPageBody['items'][number][] = [];
    let cursor: string | null = null;
    let total = -1;
    let pages = 0;
    do {
      const page: TrashPageBody = await trashPageOf(actor, {
        limit,
        cursor: cursor ?? undefined,
      });
      if (total >= 0) {
        expect(page.total).toBe(total);
      }
      total = page.total;
      items.push(...page.items);
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 100);
    expect(cursor).toBeNull();
    return { items, total };
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
      { limit: 100 },
    );
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
      { today, limit: 100 },
    );
  }

  /**
   * Reads the tasks of a list.
   *
   * @param listId - The list.
   * @param level - `roots` or `all`.
   * @param actor - Who reads, Camille by default.
   * @returns The first page of 100.
   */
  async function taskPageOf(
    listId: string,
    level: 'roots' | 'all' = 'roots',
    actor: Person = camille,
  ): Promise<z.output<typeof ListTasksInternalResponse>> {
    return read(ListTasksInternalResponse, `/internal/v1/lists/${listId}/tasks`, actor, {
      level,
      limit: 100,
    });
  }

  /**
   * Reads the keys of the tasks of a list.
   *
   * @param listId - The list.
   * @param level - `roots` or `all`.
   * @param actor - Who reads, Camille by default.
   * @returns The keys of the first page of 100, sorted, and the total.
   */
  async function tasksOf(
    listId: string,
    level: 'roots' | 'all' = 'roots',
    actor: Person = camille,
  ): Promise<{ readonly keys: string[]; readonly total: number }> {
    const page = await taskPageOf(listId, level, actor);
    return { keys: page.items.map((task) => task.key).sort(), total: page.total };
  }

  /**
   * Reads the open tasks of "Mes tâches".
   *
   * @param actor - Who reads.
   * @returns The first page of 100 with the counts of both tabs.
   */
  async function myTasksOf(actor: Person): Promise<z.output<typeof ListMyTasksInternalResponse>> {
    return read(ListMyTasksInternalResponse, `/internal/v1/users/${actor.userId}/tasks`, actor, {
      state: 'open',
      limit: 100,
    });
  }

  /**
   * Reads the task part of "Accueil".
   *
   * @param actor - Who reads.
   * @returns "Accueil".
   */
  async function homeOf(actor: Person): Promise<z.output<typeof GetHomeInternalResponse>> {
    return read(GetHomeInternalResponse, `/internal/v1/users/${actor.userId}/home`, actor, {
      today,
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
      { limit: 100 },
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
   * Reads the activity of a task.
   *
   * @param key - The task.
   * @returns The total of its activity.
   */
  async function taskActivityTotal(key: string): Promise<number> {
    const page = await read(
      ListTaskActivityInternalResponse,
      `/internal/v1/tasks/${key}/activity`,
      camille,
      { limit: 100 },
    );
    return page.total;
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
      { limit: 100 },
    );
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

  /**
   * Counts the lock requests of the cluster that wait, as `pg_locks` shows them to any role.
   *
   * @returns The number of locks not granted.
   */
  async function lockWaits(): Promise<number> {
    return countOf('select count(*)::int as total from pg_locks where not granted');
  }

  /**
   * Holds rows locked by a transaction of the migrator role, as a concurrent writer would, starts
   * the first call and waits until it waits for a lock, starts the second and waits again, then
   * releases the rows: the calls meet in the order they were started, well under the
   * `lock_timeout` of `task_app` (5 s).
   *
   * @param lock - The statement that locks the rows, run with the system access.
   * @param params - Its parameters.
   * @param first - The call that queues first.
   * @param second - The call that queues behind it.
   * @returns Both results, in the order of the calls.
   */
  async function inOrderBehind<TFirst, TSecond>(
    lock: string,
    params: readonly unknown[],
    first: () => Promise<TFirst>,
    second: () => Promise<TSecond>,
  ): Promise<[TFirst, TSecond]> {
    const blocker = await migrator.connect();
    let released = false;
    try {
      await blocker.query('begin');
      await blocker.query(`select set_config('app.system_access', 'on', true)`);
      await blocker.query(lock, [...params]);
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

  /**
   * Holds the row of a task `FOR UPDATE` while two calls queue behind it in a known order.
   *
   * @param key - The task whose row is held.
   * @param first - The call that queues first.
   * @param second - The call that queues behind it.
   * @returns Both results, in the order of the calls.
   */
  async function behindTask<TFirst, TSecond>(
    key: string,
    first: () => Promise<TFirst>,
    second: () => Promise<TSecond>,
  ): Promise<[TFirst, TSecond]> {
    return inOrderBehind(
      `select 1 from tasks
        where organization_id = $1 and key_prefix = split_part($2, '-', 1)
          and key_number = split_part($2, '-', 2)::int
        for update`,
      [atelierNordId, key],
      first,
      second,
    );
  }

  /**
   * Holds the row of a list `FOR UPDATE` while two calls queue behind it in a known order.
   *
   * @param listId - The list whose row is held.
   * @param first - The call that queues first.
   * @param second - The call that queues behind it.
   * @returns Both results, in the order of the calls.
   */
  async function behindList<TFirst, TSecond>(
    listId: string,
    first: () => Promise<TFirst>,
    second: () => Promise<TSecond>,
  ): Promise<[TFirst, TSecond]> {
    return inOrderBehind(
      'select 1 from lists where organization_id = $1 and id = $2 for update',
      [atelierNordId, listId],
      first,
      second,
    );
  }

  /**
   * Holds the row of a trash entry `FOR UPDATE` while two calls queue behind it in a known order.
   *
   * @param entryId - The entry whose row is held.
   * @param first - The call that queues first.
   * @param second - The call that queues behind it.
   * @returns Both results, in the order of the calls.
   */
  async function behindEntry<TFirst, TSecond>(
    entryId: string,
    first: () => Promise<TFirst>,
    second: () => Promise<TSecond>,
  ): Promise<[TFirst, TSecond]> {
    return inOrderBehind(
      'select 1 from trash_entries where organization_id = $1 and id = $2 for update',
      [atelierNordId, entryId],
      first,
      second,
    );
  }

  /**
   * Deletes a list and checks `204`.
   *
   * @param listId - The list.
   * @param actor - Who deletes it, Camille by default.
   * @returns The response.
   */
  async function deleteListRequest(
    listId: string,
    actor: Person = camille,
    options: SendOptions = {},
  ): Promise<request.Response> {
    return send('delete', `/internal/v1/lists/${listId}`, actor, options);
  }

  /**
   * Deletes a space.
   *
   * @param spaceId - The space.
   * @param actor - Who deletes it, Camille by default.
   * @param options - Headers and organization.
   * @returns The response.
   */
  async function deleteSpaceRequest(
    spaceId: string,
    actor: Person = camille,
    options: SendOptions = {},
  ): Promise<request.Response> {
    return send('delete', `/internal/v1/spaces/${spaceId}`, actor, options);
  }

  /**
   * Reads the lists of an organization as stored, deleted ones included.
   *
   * @param listIds - The lists.
   * @returns Version, deletion and restoration of each list still stored, by id.
   */
  async function storedLists(listIds: readonly string[]): Promise<
    Map<
      string,
      {
        readonly id: string;
        readonly version: number;
        readonly deleted_at: Date | null;
        readonly deleted_by_id: string | null;
        readonly restored_at: Date | null;
      }
    >
  > {
    const rows = await asSystem<{
      readonly id: string;
      readonly version: number;
      readonly deleted_at: Date | null;
      readonly deleted_by_id: string | null;
      readonly restored_at: Date | null;
    }>(
      `select id::text as id, version, deleted_at, deleted_by_id, restored_at from lists
        where organization_id = $1 and id = any($2::uuid[])`,
      [atelierNordId, listIds],
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  /**
   * Starts the service as main.ts assembles it, with the configuration of the environment now.
   *
   * @returns The initialized application.
   */
  async function startApplication(): Promise<NestExpressApplication> {
    // As main.ts: the configuration is read inside the start-up, never when a module is imported.
    const config = loadConfig(appConfigSchema);
    const started = await createApplication(AppModule, {
      service: 'task-service',
      config,
      internalToken: {
        verifier: {
          audience: config.INTERNAL_TOKEN_AUDIENCE,
          trustedIssuers: config.INTERNAL_TOKEN_TRUSTED_ISSUERS,
        },
      },
      logDestination: {
        write: (line: string): void => {
          if (/"level":("error"|"fatal"|50|60)/u.test(line)) {
            errorLines.push(line);
          }
        },
      },
    });
    await started.init();
    return started;
  }

  /**
   * Holds rows locked by a transaction of the migrator role while work runs, as a concurrent
   * writer would hold them; the locks are released after it, whatever happens.
   *
   * @param locks - The statements that lock the rows, run with the system access.
   * @param work - What runs while the rows are held.
   * @returns What the work returns.
   */
  async function whileHeld<TResult>(
    locks: readonly (readonly [string, readonly unknown[]])[],
    work: () => Promise<TResult>,
  ): Promise<TResult> {
    const blocker = await migrator.connect();
    let keepAlive: NodeJS.Timeout | undefined;
    try {
      await blocker.query('begin');
      await blocker.query(`select set_config('app.system_access', 'on', true)`);
      for (const [statement, params] of locks) {
        await blocker.query(statement, [...params]);
      }
      // The migrator role ends a transaction idle for 60 s: a long scenario keeps it busy.
      keepAlive = setInterval(() => {
        blocker.query('select 1').catch(() => undefined);
      }, 10_000);
      return await work();
    } finally {
      clearInterval(keepAlive);
      await blocker.query('rollback');
      blocker.release();
    }
  }

  /**
   * The statement that holds a task row `FOR UPDATE`.
   *
   * @param taskId - The id of the task.
   * @returns The statement and its parameters, for `whileHeld`.
   */
  function taskLock(taskId: string): readonly [string, readonly unknown[]] {
    return [
      'select 1 from tasks where organization_id = $1 and id = $2 for update',
      [atelierNordId, taskId],
    ];
  }

  /**
   * The statement that holds a list row `FOR UPDATE`.
   *
   * @param listId - The list.
   * @returns The statement and its parameters, for `whileHeld`.
   */
  function listLock(listId: string): readonly [string, readonly unknown[]] {
    return [
      'select 1 from lists where organization_id = $1 and id = $2 for update',
      [atelierNordId, listId],
    ];
  }

  /**
   * The statement that holds a space row `FOR SHARE`, which keeps its writers out and lets a
   * deletion of one of its lists through.
   *
   * @param spaceId - The space.
   * @returns The statement and its parameters, for `whileHeld`.
   */
  function spaceShareLock(spaceId: string): readonly [string, readonly unknown[]] {
    return [
      'select 1 from spaces where organization_id = $1 and id = $2 for share',
      [atelierNordId, spaceId],
    ];
  }

  /**
   * The statement that holds a space row `FOR UPDATE`.
   *
   * @param spaceId - The space.
   * @returns The statement and its parameters, for `whileHeld`.
   */
  function spaceLock(spaceId: string): readonly [string, readonly unknown[]] {
    return [
      'select 1 from spaces where organization_id = $1 and id = $2 for update',
      [atelierNordId, spaceId],
    ];
  }

  /**
   * Holds the row of a space `FOR UPDATE` while two calls queue behind it in a known order.
   *
   * @param spaceId - The space whose row is held.
   * @param first - The call that queues first.
   * @param second - The call that queues behind it.
   * @returns Both results, in the order of the calls.
   */
  async function behindSpace<TFirst, TSecond>(
    spaceId: string,
    first: () => Promise<TFirst>,
    second: () => Promise<TSecond>,
  ): Promise<[TFirst, TSecond]> {
    const [statement, params] = spaceLock(spaceId);
    return inOrderBehind(statement, params, first, second);
  }

  /**
   * Waits until a statement of the service waits for a lock the migrator holds.
   *
   * @param before - How many lock requests waited before the call that must wait.
   */
  async function waitForLockWait(before: number): Promise<void> {
    await vi.waitFor(
      async () => {
        expect(await lockWaits()).toBeGreaterThanOrEqual(before + 1);
      },
      { timeout: 20_000, interval: 50 },
    );
  }

  /**
   * The greatest outbox id so far, to read what a call appends.
   *
   * @returns The id, or the nil UUID when the outbox is empty.
   */
  async function lastEventId(): Promise<string> {
    const [row] = await asSystem<{ readonly id: string | null }>(
      'select id::text as id from outbox_events order by id desc limit 1',
    );
    return row?.id ?? '00000000-0000-0000-0000-000000000000';
  }

  /**
   * Reads the outbox rows appended after a known row, oldest first.
   *
   * @param after - The id of the last row before.
   * @returns The rows appended since.
   */
  async function eventsAfter(after: string): Promise<OutboxRow[]> {
    return asSystem<OutboxRow>(
      `select id::text as id, event_name, payload from outbox_events
        where id > $1::uuid order by id`,
      [after],
    );
  }

  /**
   * The problem of a refusal without `instance`, which names the path, to compare two refusals.
   *
   * @param response - A supertest response.
   * @returns The members of the problem.
   */
  function problemOf(response: request.Response): Readonly<Record<string, unknown>> {
    return Object.fromEntries(
      Object.entries(bodyOf(response) as Record<string, unknown>).filter(
        ([name]) => name !== 'instance',
      ),
    );
  }

  /**
   * Deletes a list and keeps its job from starting, by pushing its start an hour away, so that
   * the scenario runs while the tombstone has not been worked on.
   *
   * @param listId - The list.
   * @returns What lets the job start again.
   */
  async function deleteListHoldingJob(listId: string): Promise<() => Promise<void>> {
    const response = await deleteListRequest(listId);
    expect(response.status, response.text).toBe(204);
    return holdJob(TRASH_DELETED_TASKS_QUEUE, 'listId', listId);
  }

  /**
   * Deletes a space and keeps its job from starting.
   *
   * @param spaceId - The space.
   * @returns What lets the job start again.
   */
  async function deleteSpaceHoldingJob(spaceId: string): Promise<() => Promise<void>> {
    const response = await deleteSpaceRequest(spaceId);
    expect(response.status, response.text).toBe(204);
    return holdJob(TRASH_DELETED_TASKS_QUEUE, 'spaceId', spaceId);
  }

  /**
   * Pushes the start of a job that no worker took yet an hour away.
   *
   * @param queue - The queue.
   * @param member - The member of its payload that names its target.
   * @param value - The target.
   * @returns What brings the start back to now.
   */
  async function holdJob(
    queue: string,
    member: 'listId' | 'spaceId',
    value: string,
  ): Promise<() => Promise<void>> {
    const held = await migrator.query(
      `update pgboss.job set start_after = now() + interval '1 hour'
        where name = $1 and data -> 'payload' ->> '${member}' = $2 and state = 'created'
        returning id`,
      [queue, value],
    );
    // A worker that fetched the job in the milliseconds since the commit would void the scenario.
    expect(held.rows, 'the job was held before a worker took it').toHaveLength(1);
    const release = async (): Promise<void> => {
      await migrator.query(
        `update pgboss.job set start_after = now()
          where name = $1 and data -> 'payload' ->> '${member}' = $2 and state = 'created'`,
        [queue, value],
      );
    };
    heldJobs.push(release);
    return release;
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
      max: 4,
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

    // The writes of the trash are served: the switch is off by default.
    vi.stubEnv('TRASH_WRITES_ENABLED', 'true');
    telemetry = startTelemetry({ service: 'task-service', version: '0.0.0-test' });
    app = await startApplication();
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
    publishMember('joined', atelierNordId, camille, 'owner', 1);
    publishMember('joined', atelierNordId, ines, 'admin', 1);
    publishMember('joined', atelierNordId, hugo, 'member', 1);
    publishMember('joined', atelierNordId, lea, 'member', 1);
    publishMember('joined', atelierNordId, mathis, 'member', 1);
    publishMember('joined', atelierNordId, nadia, 'guest', 1);
    publishMember('joined', atelierNordId, rose, 'guest', 1);
    publishMember('joined', atelierNordId, chloe, 'guest', 1);
    publishMember('joined', atelierNordId, theo, 'member', 1);
    publishMember('joined', atelierNordId, ugo, 'member', 1);
    publishMember('joined', atelierNordId, vera, 'member', 1);
    publishMember('joined', atelierDeltaId, solene, 'owner', 1);
    await vi.waitFor(
      async () => {
        expect(await activeMembers(atelierNordId)).toEqual(
          [camille, ines, hugo, lea, mathis, nadia, rose, chloe, theo, ugo, vera]
            .map((person) => person.userId)
            .sort(),
        );
        expect(await activeMembers(atelierDeltaId)).toEqual([solene.userId]);
      },
      { timeout: 60_000, interval: 500 },
    );

    // "Produit" of Camille with Sprint 14; "Recherche", the private space of Hugo, which Léa sees
    // with `view`; "Delta", the space of the second organization.
    produit = await createSpace(camille, {
      name: 'Produit',
      prefix: 'CAD',
      icon: 'rocket',
      color: 'violet',
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
    recherche = await createSpace(hugo, {
      name: 'Recherche',
      prefix: 'RCH',
      visibility: 'private',
    });
    entretiens = await createList(hugo, recherche.space.id, { name: 'Entretiens' });
    await grant(hugo, 'spaces', recherche.space.id, lea.userId, 'view');
    delta = await createSpace(
      solene,
      { name: 'Delta', prefix: 'DLT', icon: 'rocket', color: 'violet' },
      atelierDeltaId,
    );
  }, 240_000);

  afterEach(async () => {
    for (const release of heldJobs.splice(0)) {
      await release();
    }
  });

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

  describe('deleting a task moves it and its subtasks at every level to the trash as one entry', () => {
    let root: TaskBody;
    let mockup: TaskBody;
    let keypad: TaskBody;
    let review: TaskBody;
    let oldTrack: TaskBody;
    let dropped: TaskBody;
    let droppedEntry: EntryBody;
    let entry: EntryBody;

    it('takes « Refondre l’écran de connexion SSO » with its live and archived subtasks: one instant, actor and entry, the next version each, an archive kept, a subtask deleted before left in its own entry', async () => {
      root = await createTask(camille, sprint14.id, {
        name: 'Refondre l’écran de connexion SSO',
        priority: 'haute',
        assigneeIds: [lea.userId],
        labels: ['Sécurité'],
      });
      mockup = await createSubtask(root.key, { name: 'Maquette validée' });
      keypad = await createSubtask(mockup.key, { name: 'Écran de saisie du code' });
      review = await createSubtask(root.key, { name: 'Recette' });
      oldTrack = await archiveTask((await createSubtask(root.key, { name: 'Ancienne piste' })).key);
      dropped = await createSubtask(root.key, { name: 'Piste abandonnée' });
      droppedEntry = await trashTask(dropped.key);
      expect(droppedEntry).toMatchObject({
        task: { key: dropped.key, name: 'Piste abandonnée', status: 'todo' },
        parentKey: root.key,
        subtaskCount: 0,
        list: { id: sprint14.id, spaceId: produit.space.id, name: 'Sprint 14', state: 'active' },
        trashedBy: { type: 'user', id: camille.userId },
      });

      const keys = [root.key, mockup.key, keypad.key, review.key, oldTrack.key, dropped.key];
      const before = await storedTasks(keys);
      const activityBefore = await countOf(
        `select count(*)::int as total from activity_entries where task_id = any($1::uuid[])`,
        [await Promise.all(keys.map((key) => taskIdOf(key)))],
      );

      entry = await trashTask(root.key);

      expect(entry).toMatchObject({
        task: { key: root.key, name: 'Refondre l’écran de connexion SSO', status: 'todo' },
        parentKey: null,
        subtaskCount: 4,
        list: { id: sprint14.id, spaceId: produit.space.id, name: 'Sprint 14', state: 'active' },
        trashedBy: { type: 'user', id: camille.userId },
      });
      const after = await storedTasks(keys);
      for (const key of [root.key, mockup.key, keypad.key, review.key, oldTrack.key]) {
        expect(after.get(key), key).toMatchObject({
          version: (before.get(key)?.version ?? 0) + 1,
          trash_entry_id: entry.id,
        });
      }
      // An archived subtask keeps its archive while it is in the trash.
      expect(instantOf(after.get(oldTrack.key)?.archived_at)).toBe(
        instantOf(before.get(oldTrack.key)?.archived_at),
      );
      // A subtask deleted before keeps its own entry and its version.
      expect(after.get(dropped.key)).toMatchObject({
        version: before.get(dropped.key)?.version,
        trash_entry_id: droppedEntry.id,
      });
      // The trash is not recorded in the activity log.
      expect(
        await countOf(
          `select count(*)::int as total from activity_entries where task_id = any($1::uuid[])`,
          [await Promise.all(keys.map((key) => taskIdOf(key)))],
        ),
      ).toBe(activityBefore);
    });

    it('emits task.trashed.v1 for each task of the entry, the root first, then by depth, then by id, with its entryId, rootKey, purgeAt and the next version, at the instant of the entry', async () => {
      const events = await trashedOf(entry.id);

      expect(events.map((event) => event.key)).toEqual([
        root.key,
        mockup.key,
        review.key,
        oldTrack.key,
        keypad.key,
      ]);
      const parents = new Map([
        [root.key, null],
        [mockup.key, root.key],
        [review.key, root.key],
        [oldTrack.key, root.key],
        [keypad.key, mockup.key],
      ]);
      const versions = new Map(
        [root, mockup, keypad, review, oldTrack].map((task) => [task.key, task.version + 1]),
      );
      for (const event of events) {
        expect(event, event.key).toMatchObject({
          organizationId: atelierNordId,
          actor: { type: 'user', id: camille.userId },
          entryId: entry.id,
          rootKey: root.key,
          spaceId: produit.space.id,
          listId: sprint14.id,
          parentKey: parents.get(event.key),
          version: versions.get(event.key),
        });
        expect(instantOf(event.occurredAt), event.key).toBe(instantOf(entry.trashedAt));
        expect(instantOf(event.purgeAt), event.key).toBe(instantOf(entry.purgeAt));
      }
      expect(events[0]).toMatchObject({
        name: 'Refondre l’écran de connexion SSO',
        status: 'todo',
        priority: 'haute',
        assigneeIds: [lea.userId],
        labels: ['Sécurité'],
      });
      // The subtask deleted before emitted its own events, once.
      expect((await trashedOf(droppedEntry.id)).map((event) => event.key)).toEqual([dropped.key]);
    });

    it('lists both entries on the page, the most recent first, with the root as the deletion answered it', async () => {
      const page = await trashPageOf(camille);

      expect(page.total).toBe(2);
      expect(page.nextCursor).toBeNull();
      expect(page.items).toEqual([entry, droppedEntry]);
    });
  });

  describe('a deletion is refused by what the actor sees and may change, and by the state of the task', () => {
    let guide: TaskBody;
    let notes: TaskBody;
    let itemId: string;
    let archivedGuide: TaskBody;
    let guideEntry: EntryBody;

    it('answers 404 task.not-found to an actor who does not see the task, then 403 to a view grantee, before 412', async () => {
      guide = await createTask(hugo, entretiens.id, { name: 'Guide d’entretien' });
      notes = await createSubtask(guide.key, { name: 'Questions ouvertes' }, hugo);
      const item = await send('post', `/internal/v1/tasks/${guide.key}/checklist-items`, hugo, {
        body: { text: 'Relire le guide' },
      });
      expect(item.status, item.text).toBe(201);
      itemId = conforms(AddChecklistItemInternalResponse, bodyOf(item)).checklist[0]?.id ?? '';
      expect(itemId).not.toBe('');
      const total = await outboxTotal();

      for (const actor of [camille, chloe]) {
        expectProblem(await trashRequest(guide.key, actor), 404, 'task.not-found');
        expectProblem(
          await trashRequest(guide.key, actor, { headers: stale }),
          404,
          'task.not-found',
        );
      }
      expectProblem(await trashRequest('RCH-9999', hugo), 404, 'task.not-found');
      expectProblem(await trashRequest('rch-1', hugo), 400, 'request.invalid');
      expectProblem(await trashRequest(guide.key, lea), 403, 'access.role-insufficient', {
        role: 'view',
        requiredRole: 'edit',
      });
      expectProblem(
        await trashRequest(guide.key, lea, { headers: stale }),
        403,
        'access.role-insufficient',
      );

      expect(await outboxTotal()).toBe(total);
      expect((await storedTask(guide.key))?.trash_entry_id).toBeNull();
    });

    it('refuses a body that is not an object with 400 request.invalid, and writes nothing', async () => {
      const path = `/internal/v1/tasks/${guide.key}/trash`;

      expectProblem(await send('post', path, hugo), 400, 'request.invalid');
      expectProblem(await send('post', path, hugo, { body: [] }), 400, 'request.invalid');
      expectProblem(await send('post', path, hugo, { text: 'trash' }), 400, 'request.invalid');

      expect((await storedTask(guide.key))?.trash_entry_id).toBeNull();
    });

    it('refuses an archived task with 409 task.archived, before 412, and writes nothing', async () => {
      archivedGuide = await archiveTask(
        (await createTask(hugo, entretiens.id, { name: 'Ancien guide' })).key,
        hugo,
      );
      const total = await outboxTotal();

      expectProblem(await trashRequest(archivedGuide.key, hugo), 409, 'task.archived', {
        key: archivedGuide.key,
      });
      expectProblem(
        await trashRequest(archivedGuide.key, hugo, { headers: stale }),
        409,
        'task.archived',
      );

      expect(await outboxTotal()).toBe(total);
      expect((await storedTask(archivedGuide.key))?.trash_entry_id).toBeNull();
    });

    it('checks If-Match after the role: 412 with the version, then deletes with the right one', async () => {
      const total = await outboxTotal();
      const version = (await readTask(guide.key, hugo)).version;

      expectProblem(
        await trashRequest(guide.key, hugo, { headers: stale }),
        412,
        'request.version-mismatch',
        { version },
      );
      expect(await outboxTotal()).toBe(total);

      guideEntry = entryAnswer(
        await trashRequest(guide.key, hugo, { headers: { 'If-Match': etagOf(version) } }),
      );
      expect(guideEntry).toMatchObject({
        task: { key: guide.key },
        subtaskCount: 1,
        list: { id: entretiens.id, state: 'active' },
        trashedBy: { type: 'user', id: hugo.userId },
      });
    });

    it('answers 404 task.trashed with the entry to the actor who could change the list, on every route of the key of the task and of its subtask', async () => {
      interface Call {
        readonly method: HttpMethod;
        readonly path: string;
        readonly body?: object;
      }
      const callsOf = (key: string): readonly Call[] => [
        { method: 'get', path: `/internal/v1/tasks/${key}` },
        { method: 'patch', path: `/internal/v1/tasks/${key}`, body: { name: 'Autre nom' } },
        { method: 'get', path: `/internal/v1/tasks/${key}/detail` },
        { method: 'get', path: `/internal/v1/tasks/${key}/activity` },
        { method: 'get', path: `/internal/v1/tasks/${key}/subtasks` },
        { method: 'post', path: `/internal/v1/tasks/${key}/subtasks`, body: { name: 'Nouvelle' } },
        { method: 'put', path: `/internal/v1/tasks/${key}/assignees/${lea.userId}`, body: {} },
        { method: 'delete', path: `/internal/v1/tasks/${key}/assignees/${lea.userId}` },
        { method: 'post', path: `/internal/v1/tasks/${key}/labels/add`, body: { name: 'Neuf' } },
        { method: 'post', path: `/internal/v1/tasks/${key}/labels/remove`, body: { name: 'Neuf' } },
        { method: 'post', path: `/internal/v1/tasks/${key}/checklist-items`, body: { text: 'Un' } },
        {
          method: 'patch',
          path: `/internal/v1/tasks/${key}/checklist-items/${itemId}`,
          body: { done: true },
        },
        { method: 'post', path: `/internal/v1/tasks/${key}/archive`, body: {} },
        { method: 'post', path: `/internal/v1/tasks/${key}/unarchive`, body: {} },
        { method: 'post', path: `/internal/v1/tasks/${key}/trash`, body: {} },
      ];
      const version = (await storedTask(guide.key))?.version;
      const total = await outboxTotal();

      for (const task of [guide, notes]) {
        for (const call of callsOf(task.key)) {
          const response = await send(call.method, call.path, hugo, { body: call.body });
          const label = `${call.method} ${call.path}`;
          expectProblem(response, 404, 'task.trashed');
          expect(bodyOf(response), label).toMatchObject({
            details: {
              key: task.key,
              name: task.name,
              entryId: guideEntry.id,
              rootKey: guide.key,
              trashedBy: { type: 'user', id: hugo.userId },
            },
          });
          const details = (bodyOf(response) as { details: Record<string, string> }).details;
          expect(instantOf(details.trashedAt), label).toBe(instantOf(guideEntry.trashedAt));
          expect(instantOf(details.purgeAt), label).toBe(instantOf(guideEntry.purgeAt));
        }
      }

      expect(await outboxTotal()).toBe(total);
      expect((await storedTask(guide.key))?.version).toBe(version);
    });

    it('answers 404 task.not-found, never task.trashed, to a view grantee and to an actor who does not see the task, on every route of its key and on the access check', async () => {
      const keys = [guide.key, notes.key];
      for (const actor of [lea, camille, chloe]) {
        for (const key of keys) {
          for (const [method, path, body] of [
            ['get', `/internal/v1/tasks/${key}`, undefined],
            ['patch', `/internal/v1/tasks/${key}`, { name: 'Autre nom' }],
            ['get', `/internal/v1/tasks/${key}/detail`, undefined],
            ['get', `/internal/v1/tasks/${key}/activity`, undefined],
            ['get', `/internal/v1/tasks/${key}/subtasks`, undefined],
            ['post', `/internal/v1/tasks/${key}/archive`, {}],
            ['post', `/internal/v1/tasks/${key}/trash`, {}],
          ] as const) {
            const response = await send(method, path, actor, { body });
            expect(response.status, `${method} ${path}`).toBe(404);
            expect(bodyOf(response), `${method} ${path}`).toMatchObject({ code: 'task.not-found' });
          }
        }
      }
      // The access check never answers task.trashed, to the editor either.
      for (const actor of [hugo, lea]) {
        const response = await send('get', `/internal/v1/tasks/${guide.key}/access`, actor, {
          issuer: 'realtime-gateway',
        });
        expectProblem(response, 404, 'task.not-found');
      }
    });

    it('still answers the access check of a live task of the list of a task in the trash', async () => {
      const live = await createTask(hugo, entretiens.id, { name: 'Grille d’analyse' });

      const response = await send('get', `/internal/v1/tasks/${live.key}/access`, hugo, {
        issuer: 'realtime-gateway',
      });

      expect(response.status, response.text).toBe(200);
      expect(conforms(CheckTaskAccessInternalResponse, bodyOf(response))).toMatchObject({
        role: 'edit',
        listId: entretiens.id,
        taskKey: live.key,
      });
    });
  });

  describe('a task in the trash is left out of every collection and count, and of its parent', () => {
    let lot: ListBody;
    let kept: TaskBody;
    let parent: TaskBody;
    let recetteMobile: TaskBody;
    let recetteWeb: TaskBody;
    let doomed: TaskBody;
    let doomedSub: TaskBody;
    let doomedEntry: EntryBody;
    let before: {
      readonly roots: { readonly keys: string[]; readonly total: number };
      readonly all: { readonly keys: string[]; readonly total: number };
      readonly groups: number;
      readonly counts: z.output<typeof GetListCountsInternalResponse>['counts'];
      readonly overview: OverviewBody;
      readonly leaMyTasks: z.output<typeof ListMyTasksInternalResponse>;
      readonly leaHome: z.output<typeof GetHomeInternalResponse>;
      readonly labels: string[];
      readonly activity: z.output<typeof ListListActivityInternalResponse>;
      readonly trashedActivity: number;
    };

    it('leaves « Ancienne recette », its subtask and « Recette web » out of the tasks of their list, its groups and counters, and the overview', async () => {
      lot = await createList(camille, produit.space.id, { name: 'Lot de recette' });
      kept = await createTask(camille, lot.id, {
        name: 'Plan de test',
        assigneeIds: [lea.userId],
      });
      parent = await createTask(camille, lot.id, { name: 'Campagne de recette' });
      recetteMobile = await createSubtask(parent.key, { name: 'Recette mobile' });
      recetteWeb = await createSubtask(parent.key, { name: 'Recette web' });
      doomed = await createTask(camille, lot.id, {
        name: 'Ancienne recette',
        priority: 'haute',
        assigneeIds: [lea.userId],
        dueDate: '2026-11-05',
        labels: ['Obsolète'],
      });
      doomedSub = await createSubtask(doomed.key, {
        name: 'Scénarios obsolètes',
        assigneeIds: [lea.userId],
        labels: ['Obsolète'],
      });
      before = {
        roots: await tasksOf(lot.id),
        all: await tasksOf(lot.id, 'all'),
        groups: (
          await read(
            CountTaskGroupsInternalResponse,
            `/internal/v1/lists/${lot.id}/task-groups`,
            camille,
            { groupBy: 'status', level: 'all' },
          )
        ).total,
        counts: (
          await read(
            GetListCountsInternalResponse,
            `/internal/v1/lists/${lot.id}/counts`,
            camille,
            { today },
          )
        ).counts,
        overview: await overviewOf(produit.space.id),
        leaMyTasks: await myTasksOf(lea),
        leaHome: await homeOf(lea),
        labels: await labelsOf(lea),
        activity: await listActivityOf(lot.id),
        trashedActivity:
          (await taskActivityTotal(doomed.key)) +
          (await taskActivityTotal(doomedSub.key)) +
          (await taskActivityTotal(recetteWeb.key)),
      };
      expect(before.roots.total).toBe(3);
      expect(before.all.total).toBe(6);
      expect(before.counts).toMatchObject({ total: 3, late: 1 });

      doomedEntry = await trashTask(doomed.key);
      await trashTask(recetteWeb.key);

      expect(await tasksOf(lot.id)).toEqual({
        keys: [kept.key, parent.key].sort(),
        total: 2,
      });
      expect(await tasksOf(lot.id, 'all')).toEqual({
        keys: [kept.key, parent.key, recetteMobile.key].sort(),
        total: 3,
      });
      const groups = await read(
        CountTaskGroupsInternalResponse,
        `/internal/v1/lists/${lot.id}/task-groups`,
        camille,
        { groupBy: 'status', level: 'all' },
      );
      expect(groups.total).toBe(before.groups - 3);
      const counts = await read(
        GetListCountsInternalResponse,
        `/internal/v1/lists/${lot.id}/counts`,
        camille,
        { today },
      );
      expect(counts.counts).toEqual({
        ...before.counts,
        total: 2,
        open: before.counts.open - 1,
        late: 0,
      });
      const overview = await overviewOf(produit.space.id);
      expect(overview.taskCount).toBe(before.overview.taskCount - 1);
      expect(overview.items.find((item) => item.list.id === lot.id)?.counts.total).toBe(2);
    });

    it('leaves them out of "Mes tâches", the stats and priorities of "Accueil" and the labels: a label only tasks in the trash carry disappears', async () => {
      expect(before.leaMyTasks.items.map((task) => task.key)).toEqual(
        expect.arrayContaining([doomed.key, doomedSub.key]) as unknown,
      );
      const myTasks = await myTasksOf(lea);
      expect(myTasks.items.map((task) => task.key)).toEqual(
        before.leaMyTasks.items
          .map((task) => task.key)
          .filter((key) => key !== doomed.key && key !== doomedSub.key),
      );
      expect(myTasks.counts).toEqual({
        ...before.leaMyTasks.counts,
        open: before.leaMyTasks.counts.open - 2,
      });

      const home = await homeOf(lea);
      expect(home.stats).toEqual({
        ...before.leaHome.stats,
        assigned: before.leaHome.stats.assigned - 2,
        late: before.leaHome.stats.late - 1,
      });
      expect(before.leaHome.priorities.map((task) => task.key)).toContain(doomed.key);
      expect(home.priorities.map((task) => task.key)).not.toContain(doomed.key);

      expect(before.labels).toContain('Obsolète');
      expect(await labelsOf(lea)).toEqual(before.labels.filter((name) => name !== 'Obsolète'));
      expect(await labelsOf(camille)).not.toContain('Obsolète');
    });

    it('leaves them out of the activity of their list and a subtask in the trash out of the counts, the subtasks and the detail of its live parent', async () => {
      const activity = await listActivityOf(lot.id);
      expect(activity.total).toBe(before.activity.total - before.trashedActivity);
      const trashedKeys = [doomed.key, doomedSub.key, recetteWeb.key];
      expect(before.activity.items.some((entry) => trashedKeys.includes(entry.task.key))).toBe(
        true,
      );
      expect(activity.items.filter((entry) => trashedKeys.includes(entry.task.key))).toEqual([]);

      expect((await readTask(parent.key)).subtaskCounts).toEqual({ total: 1, closed: 0 });
      expect(await subtasksOf(parent.key)).toEqual({ keys: [recetteMobile.key], total: 1 });
      const detail = await detailOf(parent.key);
      expect(detail.subtasks.map((task) => task.key)).toEqual([recetteMobile.key]);
      expect(detail.task.subtaskCounts).toEqual({ total: 1, closed: 0 });
      const summary = (await taskPageOf(lot.id)).items.find((task) => task.key === parent.key);
      expect(summary?.subtaskCounts).toEqual({ total: 1, closed: 0 });
      expect(summary?.version).toBe(parent.version);
    });

    it('does not find a task in the trash for a new parent, an access request or the access check, and stores nothing', async () => {
      expectProblem(
        await send('patch', `/internal/v1/tasks/${kept.key}`, camille, {
          body: { parentKey: doomed.key },
        }),
        422,
        'task.parent-invalid',
      );
      const access = await send('get', `/internal/v1/tasks/${doomed.key}/access`, camille, {
        issuer: 'realtime-gateway',
      });
      expectProblem(access, 404, 'task.not-found');

      // A request for a live task the requester does not see is stored; one for a task in the
      // trash is not.
      const requests = async (key: string): Promise<number> =>
        countOf(`select count(*)::int as total from access_requests where task_key = $1`, [key]);
      const stored = await send('post', '/internal/v1/access-requests', chloe, {
        body: { taskKey: kept.key },
      });
      expect(stored.status, stored.text).toBe(202);
      const ignored = await send('post', '/internal/v1/access-requests', chloe, {
        body: { taskKey: doomed.key },
      });
      expect(ignored.status, ignored.text).toBe(202);
      expect(await requests(kept.key)).toBe(1);
      expect(await requests(doomed.key)).toBe(0);
      expect(doomedEntry.subtaskCount).toBe(1);
    });
  });

  describe('the page "Corbeille" lists what the actor may restore, the most recently deleted first', () => {
    let evenements: SpaceCreated;
    let salon: ListBody;
    let jury: ListBody;
    let vitrine: ListBody;
    let interne: ListBody;
    const entries = new Map<string, EntryBody>();

    it('lists the entries of the lists a guest may edit, the most recent first, with the list active or archived, and the total on every page', async () => {
      evenements = await createSpace(camille, {
        name: 'Événements',
        prefix: 'EVT',
        icon: 'megaphone',
        color: 'orange',
      });
      salon = await createList(camille, evenements.space.id, { name: 'Salon 2026' });
      jury = await createList(camille, evenements.space.id, { name: 'Jury des prix' });
      vitrine = await createList(camille, evenements.space.id, { name: 'Vitrine' });
      interne = await createList(camille, evenements.space.id, { name: 'Interne' });
      await grant(camille, 'lists', salon.id, nadia.userId, 'edit');
      await grant(camille, 'lists', jury.id, nadia.userId, 'edit');
      await grant(camille, 'lists', vitrine.id, nadia.userId, 'view');
      await grant(camille, 'lists', vitrine.id, rose.userId, 'view');
      const plan: readonly (readonly [string, ListBody, string])[] = [
        ['stand', salon, 'Réserver le stand'],
        ['badges', salon, 'Imprimer les badges'],
        ['prix', jury, 'Choisir les prix'],
        ['vitrine', vitrine, 'Décorer la vitrine'],
        ['interne', interne, 'Compte rendu interne'],
      ];
      for (const [name, list, title] of plan) {
        const task = await createTask(camille, list.id, { name: title });
        if (name === 'badges') {
          await createSubtask(task.key, { name: 'Maquette des badges' });
        }
        entries.set(name, await trashTask(task.key));
      }
      const archivedJury = await send('post', `/internal/v1/lists/${jury.id}/archive`, camille, {
        body: {},
      });
      expect(archivedJury.status, archivedJury.text).toBe(200);

      const page = await trashPageOf(nadia);

      expect(page.items.map((item) => item.id)).toEqual(
        ['prix', 'badges', 'stand'].map((name) => entries.get(name)?.id),
      );
      expect(page.total).toBe(3);
      expect(page.nextCursor).toBeNull();
      expect(page.items[0]).toMatchObject({
        task: { name: 'Choisir les prix' },
        list: { id: jury.id, name: 'Jury des prix', state: 'archived' },
        subtaskCount: 0,
      });
      expect(page.items[1]).toMatchObject({
        task: { name: 'Imprimer les badges' },
        list: { id: salon.id, state: 'active' },
        subtaskCount: 1,
        trashedBy: { type: 'user', id: camille.userId },
      });
      for (const item of page.items) {
        expect(instantOf(item.purgeAt) - instantOf(item.trashedAt)).toBe(30 * dayMs);
      }

      const walked = await walkTrash(nadia, 1);
      expect(walked.items.map((item) => item.id)).toEqual(page.items.map((item) => item.id));
      expect(walked.total).toBe(3);
      const twoByTwo = await walkTrash(nadia, 2);
      expect(twoByTwo.items.map((item) => item.id)).toEqual(page.items.map((item) => item.id));
    });

    it('lists every entry of the lists Camille may edit, and none to an actor who edits no list: a view grantee, a guest without a grant', async () => {
      const page = await trashPageOf(camille);
      const ids = page.items.map((item) => item.id);

      for (const entry of entries.values()) {
        expect(ids).toContain(entry.id);
      }
      expect(page.total).toBe(ids.length);
      const dates = page.items.map((item) => [instantOf(item.trashedAt), item.id] as const);
      expect(dates).toEqual(
        [...dates].sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)),
      );
      const walked = await walkTrash(camille, 3);
      expect(walked.items.map((item) => item.id)).toEqual(ids);

      for (const actor of [rose, chloe]) {
        expect(await trashPageOf(actor)).toEqual({ items: [], nextCursor: null, total: 0 });
      }
    });

    it('lists a task deleted in the private "Recherche" to its editor only: not to a view grantee, not to the owner of the organization', async () => {
      const task = await createTask(hugo, entretiens.id, { name: 'Synthèse des entretiens' });
      const entry = await trashTask(task.key, hugo);

      expect((await trashPageOf(hugo)).items.map((item) => item.id)).toContain(entry.id);
      for (const actor of [lea, camille]) {
        expect((await trashPageOf(actor)).items.map((item) => item.id)).not.toContain(entry.id);
      }
    });

    it('keeps a deleted list in the page of its grantee, as if it were not deleted, and adds the tasks the job moves', async () => {
      const live = await createTask(camille, jury.id, { name: 'Remettre les trophées' });

      expect((await deleteListRequest(jury.id)).status).toBe(204);
      await jobsSettled();

      const page = await trashPageOf(nadia);
      expect(page.total).toBe(4);
      const jobEntry = page.items.find((item) => item.task.key === live.key);
      expect(jobEntry).toMatchObject({
        list: { id: jury.id, name: 'Jury des prix', state: 'deleted' },
        trashedBy: { type: 'user', id: camille.userId },
      });
      expect(page.items.map((item) => [item.task.name, item.list.state])).toEqual([
        ['Remettre les trophées', 'deleted'],
        ['Choisir les prix', 'deleted'],
        ['Imprimer les badges', 'active'],
        ['Réserver le stand', 'active'],
      ]);
      expect((await trashPageOf(rose)).total).toBe(0);
    });

    it('refuses a cursor or a limit the page does not take with 400 request.invalid', async () => {
      const first = await trashPageOf(camille, { limit: 1 });
      expect(first.nextCursor).not.toBeNull();
      const archives = await read(
        ListArchivedTasksInternalResponse,
        '/internal/v1/archives/tasks',
        camille,
        { limit: 1 },
      );

      for (const cursor of ['pas-un-curseur', archives.nextCursor ?? 'x']) {
        expectProblem(
          await send('get', `/internal/v1/trash/entries${queryOf({ cursor })}`, camille),
          400,
          'request.invalid',
          {
            issues: [
              expect.objectContaining({
                in: 'query',
                path: 'cursor',
                code: 'invalid_cursor',
              }) as unknown,
            ],
          },
        );
      }
      for (const limit of ['0', '101', 'dix']) {
        expectProblem(
          await send('get', `/internal/v1/trash/entries?limit=${limit}`, camille),
          400,
          'request.invalid',
        );
      }
    });

    it('keeps the entries of another organization out of the page, and answers an actor the copy does not hold 404 organization.not-found', async () => {
      const task = await createTask(
        solene,
        delta.firstList.id,
        { name: 'Brouillon Delta' },
        atelierDeltaId,
      );
      const entry = entryAnswer(
        await trashRequest(task.key, solene, { organizationId: atelierDeltaId }),
      );

      const ofDelta = await trashPageOf(solene, { limit: 100 }, atelierDeltaId);
      expect(ofDelta.items.map((item) => item.id)).toEqual([entry.id]);
      expect(ofDelta.total).toBe(1);
      expect((await trashPageOf(camille)).items.map((item) => item.id)).not.toContain(entry.id);
      expectProblem(
        await send('get', '/internal/v1/trash/entries', camille, {
          organizationId: atelierDeltaId,
        }),
        404,
        'organization.not-found',
      );
    });
  });

  describe('restoring an entry brings its whole subtree back to its list', () => {
    let list: ListBody;

    it('brings back the root and every subtask, an archived one still archived: the next version each, the entry gone, task.restored.v1 root first, no activity entry', async () => {
      list = await createList(camille, produit.space.id, { name: 'Reprise de la connexion' });
      const root = await createTask(camille, list.id, {
        name: 'Refondre l’écran de connexion',
        assigneeIds: [lea.userId],
        labels: ['Sécurité'],
      });
      const mockup = await createSubtask(root.key, { name: 'Maquette' });
      const keypad = await createSubtask(mockup.key, { name: 'Saisie du code' });
      const review = await createSubtask(root.key, { name: 'Recette' });
      const oldTrack = await archiveTask((await createSubtask(root.key, { name: 'Piste' })).key);
      const dropped = await createSubtask(root.key, { name: 'Abandonnée' });
      const droppedEntry = await trashTask(dropped.key);
      const members = [root.key, mockup.key, keypad.key, review.key, oldTrack.key];
      const entry = await trashTask(root.key);
      const trashed = await storedTasks([...members, dropped.key]);
      const activityBefore = await countOf('select count(*)::int as total from activity_entries');
      const archivedBefore = await read(
        ListArchivedTasksInternalResponse,
        '/internal/v1/archives/tasks',
        camille,
        { limit: 100 },
      );
      expect(archivedBefore.items.map((item) => item.task.key)).not.toContain(oldTrack.key);
      const eventsBefore = (await eventsOf('task.restored.v1', 'rootKey', root.key)).length;

      const restored = await restoreEntry(entry.id);

      expect(restored).toMatchObject({
        task: {
          key: root.key,
          version: (trashed.get(root.key)?.version ?? 0) + 1,
          archivedAt: null,
        },
        list: { id: list.id, name: 'Reprise de la connexion' },
        subtaskCount: 4,
        detached: false,
        listRestored: false,
        spaceRestored: false,
      });
      expect(restored.task.subtaskCounts).toEqual({ total: 2, closed: 0 });
      expect(await readTask(root.key)).toEqual(restored.task);
      const after = await storedTasks([...members, dropped.key]);
      for (const key of members.filter((member) => member !== oldTrack.key)) {
        expect(after.get(key), key).toMatchObject({
          version: (trashed.get(key)?.version ?? 0) + 1,
          trash_entry_id: null,
        });
      }
      // An archived member is restored, then archived again at the restoration: two versions.
      expect(after.get(oldTrack.key)).toMatchObject({
        version: (trashed.get(oldTrack.key)?.version ?? 0) + 2,
        trash_entry_id: null,
      });
      expect(after.get(dropped.key)).toMatchObject({
        version: trashed.get(dropped.key)?.version,
        trash_entry_id: droppedEntry.id,
      });
      expect(
        await countOf('select count(*)::int as total from trash_entries where id = $1', [entry.id]),
      ).toBe(0);
      expect(await countOf('select count(*)::int as total from activity_entries')).toBe(
        activityBefore,
      );
      expect((await tasksOf(list.id, 'all')).keys).toEqual(
        [root.key, mockup.key, keypad.key, review.key].sort(),
      );
      const archivedAfter = await read(
        ListArchivedTasksInternalResponse,
        '/internal/v1/archives/tasks',
        camille,
        { limit: 100 },
      );
      expect(archivedAfter.items.map((item) => item.task.key)).toContain(oldTrack.key);

      const events = await restoredSince(root.key, eventsBefore);
      expect(events.map((event) => event.key)).toEqual([
        root.key,
        mockup.key,
        review.key,
        oldTrack.key,
        keypad.key,
      ]);
      const parents = new Map([
        [root.key, null],
        [mockup.key, root.key],
        [review.key, root.key],
        [oldTrack.key, root.key],
        [keypad.key, mockup.key],
      ]);
      for (const event of events) {
        expect(event, event.key).toMatchObject({
          actor: { type: 'user', id: camille.userId },
          entryId: entry.id,
          rootKey: root.key,
          listId: list.id,
          parentKey: parents.get(event.key),
          version: (trashed.get(event.key)?.version ?? 0) + 1,
        });
      }
      expect(events[0]).toMatchObject({ assigneeIds: [lea.userId], labels: ['Sécurité'] });
      expect(instantOf(after.get(oldTrack.key)?.archived_at)).toBe(
        instantOf(events[0]?.occurredAt),
      );
      expect(
        (await outboxOf('listId', list.id)).filter(
          (row) => row.event_name === 'list.restored.v1' || row.event_name === 'space.restored.v1',
        ),
      ).toEqual([]);
    });

    it('keeps a subtask under its parent when the parent takes it back: detached false, parentKey kept', async () => {
      const parent = await createTask(camille, list.id, { name: 'Tableau de bord' });
      const child = await createSubtask(parent.key, { name: 'Courbe des inscriptions' });
      const entry = await trashTask(child.key);
      expect(entry.parentKey).toBe(parent.key);
      const eventsBefore = (await eventsOf('task.restored.v1', 'rootKey', child.key)).length;

      const restored = await restoreEntry(entry.id);

      expect(restored).toMatchObject({
        task: { key: child.key, parentKey: parent.key },
        detached: false,
        subtaskCount: 0,
      });
      expect(
        (await restoredSince(child.key, eventsBefore)).map((event) => event.parentKey),
      ).toEqual([parent.key]);
      expect(await subtasksOf(parent.key)).toEqual({ keys: [child.key], total: 1 });
    });

    it('detaches the root from a parent that is in the trash: parentKey null in the answer and in task.restored.v1, then restores the parent without it', async () => {
      const parent = await createTask(camille, list.id, { name: 'Dossier de presse' });
      const child = await createSubtask(parent.key, { name: 'Communiqué' });
      const childEntry = await trashTask(child.key);
      const parentEntry = await trashTask(parent.key);
      expect(parentEntry.subtaskCount).toBe(0);
      const eventsBefore = (await eventsOf('task.restored.v1', 'rootKey', child.key)).length;

      const restored = await restoreEntry(childEntry.id);

      expect(restored).toMatchObject({
        task: { key: child.key, parentKey: null },
        detached: true,
      });
      expect(
        (await restoredSince(child.key, eventsBefore)).map((event) => event.parentKey),
      ).toEqual([null]);
      expect(await storedTask(child.key)).toMatchObject({ parent_key: null, trash_entry_id: null });

      const back = await restoreEntry(parentEntry.id);
      expect(back).toMatchObject({ task: { key: parent.key }, detached: false, subtaskCount: 0 });
      expect(await subtasksOf(parent.key)).toEqual({ keys: [], total: 0 });
    });

    it('detaches the root from a parent that is archived', async () => {
      const parent = await createTask(camille, list.id, { name: 'Programme de la soirée' });
      const child = await createSubtask(parent.key, { name: 'Discours d’ouverture' });
      const entry = await trashTask(child.key);
      await archiveTask(parent.key);

      const restored = await restoreEntry(entry.id);

      expect(restored).toMatchObject({ task: { key: child.key, parentKey: null }, detached: true });
      expect(await storedTask(child.key)).toMatchObject({ parent_key: null, archived_at: null });
    });

    it('detaches the root from a parent that holds 25 live subtasks', async () => {
      const parent = await createTask(camille, list.id, {
        name: 'Inventaire du matériel',
        subtasks: Array.from({ length: 25 }, (_, index) => ({
          name: `Caisse ${String(index + 1)}`,
        })),
      });
      const [first] = (await subtasksOf(parent.key)).keys;
      const entry = await trashTask(first ?? '');
      await createSubtask(parent.key, { name: 'Caisse 26' });
      expect(await subtasksOf(parent.key)).toMatchObject({ total: 25 });

      const restored = await restoreEntry(entry.id);

      expect(restored).toMatchObject({ task: { key: first, parentKey: null }, detached: true });
      expect(await subtasksOf(parent.key)).toMatchObject({ total: 25 });
    });

    it('detaches the root when its parent was attached deeper meanwhile and the entry would exceed 3 levels', async () => {
      const grandparent = await createTask(camille, list.id, { name: 'Programme annuel' });
      const parent = await createTask(camille, list.id, { name: 'Trimestre 4' });
      const child = await createSubtask(parent.key, { name: 'Bilan' });
      const leaf = await createSubtask(child.key, { name: 'Chiffres du bilan' });
      const entry = await trashTask(child.key);
      expect(entry.subtaskCount).toBe(1);
      await patchTask(parent.key, { parentKey: grandparent.key });

      const restored = await restoreEntry(entry.id);

      expect(restored).toMatchObject({
        task: { key: child.key, parentKey: null },
        detached: true,
        subtaskCount: 1,
      });
      expect(await storedTask(leaf.key)).toMatchObject({ parent_key: child.key });
    });

    it('answers 404 trash-entry.not-found for an entry restored already, an unknown one and one the actor may not restore, and 400 for an id that is not a UUID', async () => {
      const task = await createTask(hugo, entretiens.id, { name: 'Compte rendu d’entretien' });
      const entry = await trashTask(task.key, hugo);
      const total = await outboxTotal();

      for (const actor of [lea, camille, chloe]) {
        expectProblem(await restoreRequest(entry.id, actor), 404, 'trash-entry.not-found');
      }
      expectProblem(await restoreRequest(randomUUID(), hugo), 404, 'trash-entry.not-found');
      expectProblem(await restoreRequest('pas-un-uuid', hugo), 400, 'request.invalid');
      expectProblem(
        await send('post', `/internal/v1/trash/entries/${entry.id}/restore`, hugo),
        400,
        'request.invalid',
      );
      expect(await outboxTotal()).toBe(total);

      await restoreEntry(entry.id, hugo);
      expectProblem(await restoreRequest(entry.id, hugo), 404, 'trash-entry.not-found');
      expect(await readTask(task.key, hugo)).toMatchObject({ key: task.key });
    });
  });

  describe('restoring an entry of a deleted list or space brings the list and the space back with it', () => {
    it('brings a deleted list back at the end of its space, with list.restored.v1 before the task events, and leaves its other tasks in the trash', async () => {
      const space = await createSpace(camille, {
        name: 'Atelier presse',
        prefix: 'ATP',
        icon: 'megaphone',
        color: 'orange',
      });
      const dossiers = await createList(camille, space.space.id, { name: 'Dossiers' });
      const brouillons = await createList(camille, space.space.id, { name: 'Brouillons' });
      const first = await createTask(camille, dossiers.id, { name: 'Dossier de presse' });
      const firstChild = await createSubtask(first.key, { name: 'Communiqué' });
      const second = await createTask(camille, dossiers.id, { name: 'Revue de presse' });
      await createTask(camille, brouillons.id, { name: 'Brouillon d’article' });
      expect((await deleteListRequest(dossiers.id)).status).toBe(204);
      await jobsSettled();
      expect(await listNamesOf(space.space.id)).toEqual(['Première liste', 'Brouillons']);
      const entries = (await trashPageOf(camille, { limit: 100 })).items.filter(
        (item) => item.list.id === dossiers.id,
      );
      expect(entries.map((item) => item.list.state)).toEqual(['deleted', 'deleted']);
      const entry = entries.find((item) => item.task.key === first.key);
      const otherEntry = entries.find((item) => item.task.key === second.key);
      const deleted = (await storedLists([dossiers.id])).get(dossiers.id);
      const eventsBefore = (await outboxOf('listId', dossiers.id)).length;

      const restored = await restoreEntry(entry?.id ?? '');

      expect(restored).toMatchObject({
        task: { key: first.key },
        list: { id: dossiers.id, name: 'Dossiers', version: (deleted?.version ?? 0) + 1 },
        subtaskCount: 1,
        detached: false,
        listRestored: true,
        spaceRestored: false,
      });
      expect(await listNamesOf(space.space.id)).toEqual([
        'Première liste',
        'Brouillons',
        'Dossiers',
      ]);
      expect(await readList(dossiers.id)).toEqual(restored.list);
      expect((await storedLists([dossiers.id])).get(dossiers.id)).toMatchObject({
        deleted_at: null,
        deleted_by_id: null,
        version: (deleted?.version ?? 0) + 1,
      });
      expect((await storedLists([dossiers.id])).get(dossiers.id)?.restored_at).not.toBeNull();
      const since = (await outboxOf('listId', dossiers.id)).slice(eventsBefore);
      expect(since.map((row) => row.event_name)).toEqual([
        'list.restored.v1',
        'list.access-changed.v1',
        'task.restored.v1',
        'task.restored.v1',
      ]);
      // The restoration republishes who reaches the list, with the version it took.
      expect(conforms(taskEventSchemas['list.access-changed.v1'], since[1]?.payload)).toMatchObject(
        {
          actor: { type: 'user', id: camille.userId },
          version: restored.list.version,
          listId: dossiers.id,
          spaceId: space.space.id,
          organizationAccess: true,
        },
      );
      const listEvent = conforms(taskEventSchemas['list.restored.v1'], since[0]?.payload);
      expect(listEvent).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        version: restored.list.version,
        listId: dossiers.id,
        spaceId: space.space.id,
        name: 'Dossiers',
        organizationAccess: true,
      });
      expect(
        since
          .slice(2)
          .map((row) => conforms(taskEventSchemas['task.restored.v1'], row.payload).key),
      ).toEqual([first.key, firstChild.key]);

      // The other task of the list stays in the trash, whose list now reads active.
      expect((await storedTask(second.key))?.trash_entry_id).toBe(otherEntry?.id);
      expect(
        (await trashPageOf(camille, { limit: 100 })).items.find(
          (item) => item.id === otherEntry?.id,
        ),
      ).toMatchObject({ list: { id: dossiers.id, state: 'active' } });
      expectProblem(
        await send('get', `/internal/v1/tasks/${second.key}`, camille),
        404,
        'task.trashed',
      );
      expect(await restoreEntry(otherEntry?.id ?? '')).toMatchObject({ listRestored: false });
    });

    it('brings a deleted space back at the end of the sidebar with its settings and grants, with space.restored.v1, then list.restored.v1, then the tasks, and leaves its other lists deleted', async () => {
      const space = await createSpace(camille, {
        name: 'Pôle communication',
        prefix: 'COM',
        icon: 'megaphone',
        color: 'orange',
      });
      const newsletters = await createList(camille, space.space.id, { name: 'Newsletters' });
      const internal = await createList(camille, space.space.id, { name: 'Événements internes' });
      const issue = await createTask(camille, newsletters.id, { name: 'Numéro de novembre' });
      const party = await createTask(camille, internal.id, { name: 'Fête de fin d’année' });
      await grant(camille, 'spaces', space.space.id, lea.userId, 'comment');
      expect((await deleteSpaceRequest(space.space.id)).status).toBe(204);
      await jobsSettled();
      const idsOfSpaces = async (): Promise<string[]> =>
        (
          await read(ListSpacesInternalResponse, '/internal/v1/spaces', camille, { limit: 100 })
        ).items.map((item) => item.id);
      expect(await idsOfSpaces()).not.toContain(space.space.id);
      const entries = (await trashPageOf(camille, { limit: 100 })).items;
      const entry = entries.find((item) => item.task.key === issue.key);
      const otherEntry = entries.find((item) => item.task.key === party.key);
      expect(entry?.list.state).toBe('deleted');
      const deleted = await asSystem<{ readonly version: number }>(
        'select version from spaces where id = $1',
        [space.space.id],
      );
      const eventsBefore = (await outboxOf('spaceId', space.space.id)).length;

      const restored = await restoreEntry(entry?.id ?? '');

      expect(restored).toMatchObject({
        task: { key: issue.key },
        list: { id: newsletters.id },
        detached: false,
        listRestored: true,
        spaceRestored: true,
      });
      const ids = await idsOfSpaces();
      expect(ids.at(-1)).toBe(space.space.id);
      expect(await listNamesOf(space.space.id)).toEqual(['Newsletters']);
      expectProblem(
        await send('get', `/internal/v1/lists/${internal.id}`, camille),
        404,
        'list.not-found',
      );
      const grants = await send('get', `/internal/v1/spaces/${space.space.id}/grants`, camille);
      expect(grants.status, grants.text).toBe(200);
      expect(JSON.stringify(bodyOf(grants))).toContain(lea.userId);
      expect(
        (
          await asSystem<{ readonly version: number; readonly restored: boolean }>(
            'select version, restored_at is not null as restored from spaces where id = $1 and deleted_at is null',
            [space.space.id],
          )
        )[0],
      ).toEqual({ version: (deleted[0]?.version ?? 0) + 1, restored: true });
      const since = (await outboxOf('spaceId', space.space.id)).slice(eventsBefore);
      expect(since.map((row) => row.event_name)).toEqual([
        'space.restored.v1',
        'space.access-republished.v1',
        'list.restored.v1',
        'list.access-changed.v1',
        'task.restored.v1',
      ]);
      expect(
        conforms(taskEventSchemas['space.access-republished.v1'], since[1]?.payload),
      ).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        version: (deleted[0]?.version ?? 0) + 1,
        spaceId: space.space.id,
        grants: [{ userId: lea.userId, role: 'comment' }],
      });
      expect(conforms(taskEventSchemas['list.access-changed.v1'], since[3]?.payload)).toMatchObject(
        {
          listId: newsletters.id,
          spaceId: space.space.id,
          organizationAccess: true,
        },
      );
      expect(conforms(taskEventSchemas['space.restored.v1'], since[0]?.payload)).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        version: (deleted[0]?.version ?? 0) + 1,
        spaceId: space.space.id,
        name: 'Pôle communication',
        prefix: 'COM',
      });
      expect(conforms(taskEventSchemas['list.restored.v1'], since[2]?.payload)).toMatchObject({
        listId: newsletters.id,
        spaceId: space.space.id,
      });

      // The other list is still deleted: its entry reads so, and restoring it brings only it.
      expect(
        (await trashPageOf(camille, { limit: 100 })).items.find(
          (item) => item.id === otherEntry?.id,
        ),
      ).toMatchObject({ list: { id: internal.id, state: 'deleted' } });
      expectProblem(
        await send('get', `/internal/v1/tasks/${party.key}`, camille),
        404,
        'task.trashed',
      );
      expect(await restoreEntry(otherEntry?.id ?? '')).toMatchObject({
        listRestored: true,
        spaceRestored: false,
      });
      expect(await listNamesOf(space.space.id)).toEqual(['Newsletters', 'Événements internes']);
    });
  });

  describe('erasing an entry removes its tasks and everything around them for good', () => {
    let list: ListBody;

    it('erases the tasks, assignees, labels, checklist items and activity of an entry, emits task.purged.v1 per task with the next version, and detaches a subtask of another entry', async () => {
      list = await createList(camille, produit.space.id, { name: 'Ménage de printemps' });
      const root = await createTask(camille, list.id, {
        name: 'Ancien parcours d’inscription',
        assigneeIds: [lea.userId],
        labels: ['Parcours'],
        priority: 'haute',
      });
      const child = await createSubtask(root.key, {
        name: 'Écran de bienvenue',
        assigneeIds: [lea.userId],
      });
      const leaf = await createSubtask(child.key, { name: 'Texte de bienvenue' });
      await patchTask(leaf.key, { status: 'progress' });
      const item = await send('post', `/internal/v1/tasks/${root.key}/checklist-items`, camille, {
        body: { text: 'Archiver les maquettes' },
      });
      expect(item.status, item.text).toBe(201);
      const comment = await send('post', `/internal/v1/tasks/${root.key}/comments`, camille, {
        body: { body: 'Removed with the task' },
      });
      expect(comment.status, comment.text).toBe(201);
      const commentId = conforms(CreateTaskCommentInternalResponse, bodyOf(comment)).id;
      const deletedComment = await send(
        'delete',
        `/internal/v1/tasks/${root.key}/comments/${commentId}`,
        camille,
      );
      expect(deletedComment.status, deletedComment.text).toBe(204);
      const sibling = await createSubtask(root.key, { name: 'Écran de fin' });
      const siblingEntry = await trashTask(sibling.key);
      const siblingVersion = (await storedTask(sibling.key))?.version;
      const keys = [root.key, child.key, leaf.key];
      const ids = await Promise.all(keys.map((key) => taskIdOf(key)));
      const entry = await trashTask(root.key);
      const trashed = await storedTasks(keys);
      const rowsOf = async (table: string): Promise<number> =>
        countOf(`select count(*)::int as total from ${table} where task_id = any($1::uuid[])`, [
          ids,
        ]);
      for (const table of [
        'task_assignees',
        'task_labels',
        'checklist_items',
        'activity_entries',
        'task_comments',
      ]) {
        expect(await rowsOf(table), table).toBeGreaterThan(0);
      }

      await purgeEntry(entry.id);

      expect(await storedTasks(keys)).toEqual(new Map());
      for (const table of [
        'task_assignees',
        'task_labels',
        'checklist_items',
        'activity_entries',
        'task_comments',
      ]) {
        expect(await rowsOf(table), table).toBe(0);
      }
      expect(
        await countOf('select count(*)::int as total from trash_entries where id = $1', [entry.id]),
      ).toBe(0);
      const events = await purgedOf(entry.id);
      expect(events.map((event) => event.key)).toEqual([root.key, child.key, leaf.key]);
      const parents = new Map([
        [root.key, null],
        [child.key, root.key],
        [leaf.key, child.key],
      ]);
      for (const event of events) {
        expect(event, event.key).toMatchObject({
          organizationId: atelierNordId,
          actor: { type: 'user', id: camille.userId },
          entryId: entry.id,
          rootKey: root.key,
          spaceId: produit.space.id,
          listId: list.id,
          parentKey: parents.get(event.key),
          version: (trashed.get(event.key)?.version ?? 0) + 1,
        });
      }
      expect(await trashedOf(entry.id)).toHaveLength(3);

      // The subtask deleted before outlives its parent, detached, at its version.
      expect(await storedTask(sibling.key)).toMatchObject({
        parent_key: null,
        trash_entry_id: siblingEntry.id,
        version: siblingVersion,
      });
    });

    it('answers 404 trash-entry.not-found to an erasure of an erased entry, an unknown one and one the actor may not restore, and 400 for an id that is not a UUID', async () => {
      const task = await createTask(hugo, entretiens.id, { name: 'Brouillon d’entretien' });
      const entry = await trashTask(task.key, hugo);
      const total = await outboxTotal();

      for (const actor of [lea, camille, chloe]) {
        expectProblem(await purgeRequest(entry.id, actor), 404, 'trash-entry.not-found');
      }
      expectProblem(await purgeRequest(randomUUID(), hugo), 404, 'trash-entry.not-found');
      expectProblem(await purgeRequest('pas-un-uuid', hugo), 400, 'request.invalid');
      expect(await outboxTotal()).toBe(total);
      expect((await storedTask(task.key))?.trash_entry_id).toBe(entry.id);

      await purgeEntry(entry.id, hugo);
      expectProblem(await purgeRequest(entry.id, hugo), 404, 'trash-entry.not-found');
      expectProblem(await restoreRequest(entry.id, hugo), 404, 'trash-entry.not-found');
      expect(await storedTask(task.key)).toBeUndefined();
    });

    it('never gives a key again: a task created after the erasure of the last one takes the next number', async () => {
      const last = await createTask(camille, list.id, { name: 'Dernière tâche du ménage' });
      const number = Number(last.key.split('-')[1]);
      await purgeEntry((await trashTask(last.key)).id);

      const next = await createTask(camille, list.id, { name: 'Tâche suivante' });

      expect(next.key).toBe(`${last.key.split('-')[0] ?? ''}-${String(number + 1)}`);
    });

    it('erases a deleted list and its deleted space with their last entries, and keeps the prefix of the space reserved', async () => {
      const serie = await createSpace(camille, {
        name: 'Fin de série',
        prefix: 'FDS',
        icon: 'rocket',
        color: 'violet',
      });
      const empty = serie.firstList;
      const first = await createList(camille, serie.space.id, { name: 'Dernières cartes' });
      const second = await createList(camille, serie.space.id, { name: 'Dernières affiches' });
      const cards = await createTask(camille, first.id, { name: 'Cartes de vœux' });
      const posters = await createTask(camille, second.id, { name: 'Affiches' });
      const stickers = await createTask(camille, second.id, { name: 'Autocollants' });
      await grant(camille, 'lists', second.id, nadia.userId, 'view');
      await grant(camille, 'spaces', serie.space.id, lea.userId, 'view');

      expect((await deleteSpaceRequest(serie.space.id)).status).toBe(204);
      await jobsSettled();

      const entries = (await trashPageOf(camille, { limit: 100 })).items.filter((item) =>
        [cards.key, posters.key, stickers.key].includes(item.task.key),
      );
      expect(entries.map((item) => item.list.state)).toEqual(['deleted', 'deleted', 'deleted']);
      // A deleted list that holds no task goes at once, as the job finds nothing to move.
      const listRows = async (): Promise<string[]> =>
        [...(await storedLists([empty.id, first.id, second.id])).keys()].sort();
      expect(await listRows()).toEqual([first.id, second.id].sort());
      const spaceRows = async (): Promise<number> =>
        countOf('select count(*)::int as total from spaces where id = $1', [serie.space.id]);
      expect(await spaceRows()).toBe(1);

      const entryOf = (key: string): string =>
        entries.find((item) => item.task.key === key)?.id ?? '';
      await purgeEntry(entryOf(cards.key));
      expect(await listRows()).toEqual([second.id]);
      expect(await spaceRows()).toBe(1);
      await purgeEntry(entryOf(posters.key));
      expect(await listRows()).toEqual([second.id]);
      await purgeEntry(entryOf(stickers.key));

      expect(await listRows()).toEqual([]);
      expect(await spaceRows()).toBe(0);
      expect(
        await countOf(`select count(*)::int as total from list_grants where list_id = $1`, [
          second.id,
        ]),
      ).toBe(0);
      expect(
        await countOf(`select count(*)::int as total from space_grants where space_id = $1`, [
          serie.space.id,
        ]),
      ).toBe(0);
      expect(
        await countOf(`select count(*)::int as total from space_prefixes where prefix = 'FDS'`),
      ).toBe(1);
      expectProblem(
        await send('post', '/internal/v1/spaces', camille, {
          body: { name: 'Fin de série bis', prefix: 'FDS' },
        }),
        409,
        'space.prefix-taken',
      );
    });
  });

  describe('"Vider la corbeille" takes the entries the actor may restore out of the trash at once, and a job erases them', () => {
    it('answers 202 with the count, hides the entries at once, then erases them with the requester as actor and leaves the entries of others alone', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Vidage' });
      const tasks = [
        await createTask(camille, list.id, { name: 'À vider 1', assigneeIds: [lea.userId] }),
        await createTask(camille, list.id, { name: 'À vider 2' }),
      ];
      await createSubtask(tasks[1]?.key ?? '', { name: 'À vider 2 bis' });
      const entries = [await trashTask(tasks[0]?.key ?? ''), await trashTask(tasks[1]?.key ?? '')];
      const secret = await createTask(hugo, entretiens.id, { name: 'Notes privées' });
      const secretEntry = await trashTask(secret.key, hugo);
      const foreign = await createTask(
        solene,
        delta.firstList.id,
        { name: 'Autre organisation' },
        atelierDeltaId,
      );
      const foreignEntry = entryAnswer(
        await trashRequest(foreign.key, solene, { organizationId: atelierDeltaId }),
      );
      const waiting = await trashPageOf(camille);
      const jobsBefore = await countOf(
        `select count(*)::int as total from pgboss.job where name = $1`,
        [PURGE_TRASH_QUEUE],
      );
      const eventsBefore = await countOf(
        `select count(*)::int as total from outbox_events where event_name = 'task.purged.v1'`,
      );
      expect(waiting.total).toBeGreaterThanOrEqual(2);

      const response = await emptyRequest(camille);

      expect(response.status, response.text).toBe(202);
      expect(conforms(EmptyTrashInternalResponse, bodyOf(response))).toEqual({
        entryCount: waiting.total,
      });
      // At once: nothing to list, restore or erase, and the tasks read as unknown.
      expect(await trashPageOf(camille)).toEqual({ items: [], nextCursor: null, total: 0 });
      for (const entry of entries) {
        expectProblem(await restoreRequest(entry.id), 404, 'trash-entry.not-found');
        expectProblem(await purgeRequest(entry.id), 404, 'trash-entry.not-found');
      }
      expectProblem(
        await send('get', `/internal/v1/tasks/${tasks[0]?.key ?? ''}`, camille),
        404,
        'task.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${tasks[0]?.key ?? ''}/subtasks`, camille),
        404,
        'task.not-found',
      );
      expect(
        await countOf(`select count(*)::int as total from pgboss.job where name = $1`, [
          PURGE_TRASH_QUEUE,
        ]),
      ).toBe(jobsBefore + 1);

      await jobsSettled();

      for (const task of tasks) {
        expect(await storedTask(task.key), task.key).toBeUndefined();
      }
      const purged = await purgedOf(entries[0]?.id ?? '');
      expect(purged).toHaveLength(1);
      expect(purged[0]).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        key: tasks[0]?.key,
        entryId: entries[0]?.id,
      });
      expect((await purgedOf(entries[1]?.id ?? '')).map((event) => event.actor)).toEqual([
        { type: 'user', id: camille.userId },
        { type: 'user', id: camille.userId },
      ]);
      expect(
        (await countOf(
          `select count(*)::int as total from outbox_events where event_name = 'task.purged.v1'`,
        )) - eventsBefore,
      ).toBeGreaterThanOrEqual(3);

      // Hugo's private entry and the entry of the other organization are still in their trash.
      expect((await trashPageOf(hugo)).items.map((item) => item.id)).toContain(secretEntry.id);
      expect(
        (await trashPageOf(solene, { limit: 100 }, atelierDeltaId)).items.map((item) => item.id),
      ).toContain(foreignEntry.id);
      expect((await storedTask(secret.key))?.trash_entry_id).toBe(secretEntry.id);
    });

    it('answers 202 with a count of 0 and enqueues no job when the actor has nothing to empty, a guest without grant and a view grantee included', async () => {
      const jobs = async (): Promise<number> =>
        countOf(`select count(*)::int as total from pgboss.job where name = $1`, [
          PURGE_TRASH_QUEUE,
        ]);
      const before = await jobs();

      for (const actor of [camille, chloe, rose]) {
        const response = await emptyRequest(actor);
        expect(response.status, response.text).toBe(202);
        expect(conforms(EmptyTrashInternalResponse, bodyOf(response))).toEqual({ entryCount: 0 });
      }

      expect(await jobs()).toBe(before);
    });

    it('refuses a body that is not an object with 400 request.invalid', async () => {
      expectProblem(
        await send('post', '/internal/v1/trash/empty', camille),
        400,
        'request.invalid',
      );
      expectProblem(
        await send('post', '/internal/v1/trash/empty', camille, { body: [] }),
        400,
        'request.invalid',
      );
    });
  });

  describe('deleting a list makes it a tombstone at once, and a job moves its tasks to the trash', () => {
    let lancement: SpaceCreated;
    let plan: ListBody;
    let keep: ListBody;
    let planBefore: ListBody;
    let t1: TaskBody;
    let t1a: TaskBody;
    let t1b: TaskBody;
    let t2: TaskBody;
    let t3: TaskBody;
    let t3a: TaskBody;
    let keptTask: TaskBody;
    let overviewBefore: OverviewBody;

    /**
     * Counts the access requests, pending or not, that name a list of Atelier Nord.
     *
     * @param listId - The list.
     * @returns The count.
     */
    async function requestsOf(listId: string): Promise<number> {
      return countOf(`select count(*)::int as total from access_requests where list_id = $1`, [
        listId,
      ]);
    }

    it('refuses a list the actor does not see with 404 list.not-found, a view grantee with 403 access.role-insufficient, then a stale If-Match with 412, and deletes nothing', async () => {
      lancement = await createSpace(camille, {
        name: 'Lancement',
        prefix: 'LNC',
        icon: 'rocket',
        color: 'orange',
      });
      plan = await createList(camille, lancement.space.id, { name: 'Plan de lancement' });
      keep = await createList(camille, lancement.space.id, { name: 'Après le lancement' });
      await grant(camille, 'lists', plan.id, rose.userId, 'view');
      await grant(camille, 'lists', plan.id, nadia.userId, 'view');
      t1 = await createTask(camille, plan.id, { name: 'Dossier de presse' });
      t1a = await createSubtask(t1.key, { name: 'Communiqué' });
      t1b = await archiveTask((await createSubtask(t1.key, { name: 'Ancien communiqué' })).key);
      t2 = await createTask(camille, plan.id, { name: 'Réserver la salle' });
      t3 = await createTask(camille, plan.id, { name: 'Ancien plan média' });
      t3a = await createSubtask(t3.key, { name: 'Budget média' });
      t3 = await archiveTask(t3.key);
      keptTask = await createTask(camille, keep.id, { name: 'Bilan du lancement' });
      for (const body of [{ listId: plan.id }, { taskKey: t2.key }]) {
        const response = await send('post', '/internal/v1/access-requests', chloe, { body });
        expect(response.status, JSON.stringify(body)).toBe(202);
      }
      expect(await requestsOf(plan.id)).toBe(2);
      planBefore = await readList(plan.id);
      overviewBefore = await overviewOf(lancement.space.id);
      const total = await outboxTotal();

      for (const listId of [randomUUID(), plan.id]) {
        expectProblem(await deleteListRequest(listId, chloe), 404, 'list.not-found');
      }
      expectProblem(
        await deleteListRequest(plan.id, chloe, { headers: stale }),
        404,
        'list.not-found',
      );
      expectProblem(await deleteListRequest(plan.id, rose), 403, 'access.role-insufficient', {
        role: 'view',
        requiredRole: 'edit',
      });
      expectProblem(
        await deleteListRequest(plan.id, nadia, { headers: stale }),
        403,
        'access.role-insufficient',
      );
      expectProblem(
        await deleteListRequest(plan.id, camille, { headers: stale }),
        412,
        'request.version-mismatch',
        { version: planBefore.version },
      );

      expect(await outboxTotal()).toBe(total);
      expect(await readList(plan.id)).toEqual(planBefore);
      expect(await requestsOf(plan.id)).toBe(2);
    });

    it('answers 204 and leaves the list and its tasks unseen at once, before the job ran: every route of the list answers 404, and the tasks answer task.not-found, even to an editor', async () => {
      const blocker = await migrator.connect();
      try {
        // The job cannot move « Réserver la salle » while its row is held: what the reads below
        // see is the state between the deletion and the job.
        await blocker.query('begin');
        await blocker.query(`select set_config('app.system_access', 'on', true)`);
        await blocker.query(
          `select 1 from tasks where organization_id = $1 and id = $2 for update`,
          [atelierNordId, await taskIdOf(t2.key)],
        );
        const response = await deleteListRequest(plan.id, camille, {
          headers: { 'If-Match': etagOf(planBefore.version) },
        });
        expect(response.status, response.text).toBe(204);
        expect(response.text).toBe('');

        const listRoutes: readonly (readonly [HttpMethod, string, object | undefined])[] = [
          ['get', `/internal/v1/lists/${plan.id}`, undefined],
          ['patch', `/internal/v1/lists/${plan.id}`, { color: 'azur' }],
          ['get', `/internal/v1/lists/${plan.id}/counts?today=${today}`, undefined],
          ['get', `/internal/v1/lists/${plan.id}/activity`, undefined],
          ['get', `/internal/v1/lists/${plan.id}/tasks`, undefined],
          ['get', `/internal/v1/lists/${plan.id}/task-groups?groupBy=status`, undefined],
          ['post', `/internal/v1/lists/${plan.id}/tasks`, { name: 'Nouvelle tâche' }],
          ['post', `/internal/v1/lists/${plan.id}/archive`, {}],
          ['post', `/internal/v1/lists/${plan.id}/unarchive`, {}],
          ['delete', `/internal/v1/lists/${plan.id}`, undefined],
          ['get', `/internal/v1/lists/${plan.id}/grants`, undefined],
          ['put', `/internal/v1/lists/${plan.id}/grants/${lea.userId}`, { role: 'view' }],
          ['delete', `/internal/v1/lists/${plan.id}/grants/${rose.userId}`, undefined],
        ];
        for (const actor of [camille, rose]) {
          for (const [method, path, body] of listRoutes) {
            expectProblem(await send(method, path, actor, { body }), 404, 'list.not-found');
          }
        }
        expectProblem(
          await send('get', `/internal/v1/lists/${plan.id}/access`, camille, {
            issuer: 'realtime-gateway',
          }),
          404,
          'list.not-found',
        );
        for (const key of [t1.key, t2.key, t3.key]) {
          for (const path of [
            `/internal/v1/tasks/${key}`,
            `/internal/v1/tasks/${key}/detail`,
            `/internal/v1/tasks/${key}/activity`,
          ]) {
            expectProblem(await send('get', path, camille), 404, 'task.not-found');
          }
          expectProblem(
            await send('get', `/internal/v1/tasks/${key}/access`, camille, {
              issuer: 'realtime-gateway',
            }),
            404,
            'task.not-found',
          );
        }
        expectProblem(await trashRequest(t2.key), 404, 'task.not-found');

        // The list is absent from the lists of its space, its overview, "Accueil" and the counts.
        expect(await listNamesOf(lancement.space.id)).toEqual([
          'Première liste',
          'Après le lancement',
        ]);
        const overview = await overviewOf(lancement.space.id);
        expect(overview.items.map((item) => item.list.id)).not.toContain(plan.id);
        expect(overview.listCount).toBe(overviewBefore.listCount - 1);
        expect(overview.taskCount).toBe(overviewBefore.taskCount - 2);
        const home = await homeOf(camille);
        expect(home.lists.map((item) => item.list.id)).not.toContain(plan.id);
        expect((await trashPageOf(camille)).items.map((item) => item.task.key)).not.toContain(
          t1.key,
        );
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }
    });

    it('emits list.deleted.v1 once, with the next version and the actor, before any task.trashed.v1, and keeps the tombstone as stored', async () => {
      await jobsSettled();

      const events = await eventsOf('list.deleted.v1', 'listId', plan.id);
      expect(events).toHaveLength(1);
      const payload = conforms(taskEventSchemas['list.deleted.v1'], events[0]?.payload);
      expect(payload).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: camille.userId },
        version: planBefore.version + 1,
        listId: plan.id,
        spaceId: lancement.space.id,
      });
      const stored = (await storedLists([plan.id, keep.id])).get(plan.id);
      expect(stored).toMatchObject({
        version: planBefore.version + 1,
        deleted_by_id: camille.userId,
      });
      expect(instantOf(stored?.deleted_at)).toBe(instantOf(payload.occurredAt));
      const firstTrashed = (await eventsOf('task.trashed.v1', 'listId', plan.id))[0];
      expect(firstTrashed === undefined ? '' : firstTrashed.id > (events[0]?.id ?? '')).toBe(true);
      expect((await storedLists([plan.id, keep.id])).get(keep.id)).toMatchObject({
        deleted_at: null,
      });
    });

    it('moves every task: one entry per top-level task, an archive and the archived subtasks of a live task included, by the actor of the deletion, with the archives kept while they are in the trash', async () => {
      const keys = [t1.key, t1a.key, t1b.key, t2.key, t3.key, t3a.key];
      const stored = await storedTasks(keys);
      expect(
        await countOf(
          'select count(*)::int as total from tasks where list_id = $1 and trash_entry_id is null',
          [plan.id],
        ),
      ).toBe(0);
      const entries = (await trashPageOf(camille, { limit: 100 })).items.filter(
        (item) => item.list.id === plan.id,
      );

      expect(entries.map((item) => [item.task.key, item.subtaskCount]).sort()).toEqual(
        [
          [t1.key, 2],
          [t2.key, 0],
          [t3.key, 1],
        ].sort(),
      );
      for (const item of entries) {
        expect(item).toMatchObject({
          list: { id: plan.id, name: 'Plan de lancement', state: 'deleted' },
          parentKey: null,
          trashedBy: { type: 'user', id: camille.userId },
        });
      }
      expect(new Set(entries.map((item) => item.trashedAt)).size).toBe(1);
      for (const key of keys) {
        expect(stored.get(key)?.trash_entry_id, key).not.toBeNull();
      }
      for (const key of [t1b.key, t3.key, t3a.key]) {
        expect(stored.get(key)?.archived_at, key).not.toBeNull();
      }
      const trashed = await eventsOf('task.trashed.v1', 'listId', plan.id);
      expect(trashed).toHaveLength(6);
      for (const row of trashed) {
        expect(conforms(taskEventSchemas['task.trashed.v1'], row.payload)).toMatchObject({
          actor: { type: 'user', id: camille.userId },
          listId: plan.id,
        });
      }
      const archived = await read(
        ListArchivedTasksInternalResponse,
        '/internal/v1/archives/tasks',
        camille,
        { limit: 100 },
      );
      expect(archived.items.map((item) => item.task.key)).not.toContain(t3.key);
      expect(archived.items.map((item) => item.task.key)).not.toContain(t1b.key);
      expect(await readTask(keptTask.key)).toMatchObject({ key: keptTask.key, listId: keep.id });
    });

    it('drops the pending access requests of the list and of its tasks, stores none for it any more, and answers its tasks 404 task.trashed to an editor and 404 task.not-found to a view grantee', async () => {
      expect(await requestsOf(plan.id)).toBe(0);
      const again = await send('post', '/internal/v1/access-requests', chloe, {
        body: { listId: plan.id },
      });
      expect(again.status, again.text).toBe(202);
      expect(await requestsOf(plan.id)).toBe(0);

      const editor = await send('get', `/internal/v1/tasks/${t2.key}`, camille);
      expectProblem(editor, 404, 'task.trashed', { key: t2.key, name: 'Réserver la salle' });
      expectProblem(await send('get', `/internal/v1/tasks/${t2.key}`, rose), 404, 'task.not-found');
      expectProblem(
        await send('get', `/internal/v1/tasks/${t2.key}`, nadia),
        404,
        'task.not-found',
      );
    });
  });

  describe('deleting a space makes it and its lists tombstones at once, and a job moves their tasks to the trash', () => {
    let marketing: SpaceCreated;
    let campagne: ListBody;
    let salonList: ListBody;
    let budget: ListBody;
    let tasks: Readonly<Record<'a' | 'b' | 'c' | 'd', TaskBody>>;
    let listsBefore: Map<string, { readonly version: number }>;

    it('refuses a space the actor does not see with 404 space.not-found, a member who does not manage it with 403 space.manage-forbidden, then a stale If-Match with 412', async () => {
      marketing = await createSpace(camille, {
        name: 'Marketing',
        prefix: 'MKT',
        icon: 'megaphone',
        color: 'orange',
      });
      campagne = await createList(camille, marketing.space.id, { name: 'Campagne de rentrée' });
      salonList = await createList(camille, marketing.space.id, { name: 'Salon 2026' });
      budget = await createList(camille, marketing.space.id, { name: 'Budget 2027' });
      tasks = {
        a: await createTask(camille, marketing.firstList.id, {
          name: 'Brief marketing',
        }),
        b: await createTask(camille, campagne.id, { name: 'Affiche de rentrée' }),
        c: await createTask(camille, salonList.id, { name: 'Réserver le stand' }),
        d: await createTask(camille, budget.id, { name: 'Chiffrer le stand' }),
      };
      await createSubtask(tasks.b.key, { name: 'Maquette de l’affiche' });
      await archiveTask(tasks.d.key);
      await send('post', `/internal/v1/lists/${budget.id}/archive`, camille, { body: {} });
      // « Campagne de rentrée » is deleted on its own first: its tombstone and its entries stay as
      // they are when its space follows.
      expect((await deleteListRequest(campagne.id)).status).toBe(204);
      await jobsSettled();
      for (const [name, body] of [
        ['list', { listId: salonList.id }],
        ['task', { taskKey: tasks.c.key }],
      ] as const) {
        const response = await send('post', '/internal/v1/access-requests', chloe, { body });
        expect(response.status, name).toBe(202);
      }
      const requests = async (): Promise<number> =>
        countOf(`select count(*)::int as total from access_requests where space_id = $1`, [
          marketing.space.id,
        ]);
      expect(await requests()).toBe(2);
      listsBefore = await storedLists([
        marketing.firstList.id,
        campagne.id,
        salonList.id,
        budget.id,
      ]);
      const total = await outboxTotal();

      expectProblem(await deleteSpaceRequest(randomUUID(), camille), 404, 'space.not-found');
      expectProblem(await deleteSpaceRequest(marketing.space.id, chloe), 404, 'space.not-found');
      expectProblem(
        await deleteSpaceRequest(marketing.space.id, chloe, { headers: stale }),
        404,
        'space.not-found',
      );
      for (const actor of [lea, hugo]) {
        expectProblem(
          await deleteSpaceRequest(marketing.space.id, actor),
          403,
          'space.manage-forbidden',
        );
      }
      expectProblem(
        await deleteSpaceRequest(marketing.space.id, lea, { headers: stale }),
        403,
        'space.manage-forbidden',
      );
      expectProblem(
        await deleteSpaceRequest(marketing.space.id, camille, { headers: stale }),
        412,
        'request.version-mismatch',
        { version: marketing.space.version },
      );

      expect(await outboxTotal()).toBe(total);
      expect(await requests()).toBe(2);
      expect((await storedLists([salonList.id])).get(salonList.id)?.deleted_at).toBeNull();
    });

    it('lets an admin of the organization delete a space of the organization: 204, the space and its lists unseen at once, space.deleted.v1 and no list.deleted.v1', async () => {
      const response = await deleteSpaceRequest(marketing.space.id, ines, {
        headers: { 'If-Match': etagOf(marketing.space.version) },
      });

      expect(response.status, response.text).toBe(204);
      expect(response.text).toBe('');
      for (const actor of [camille, ines, hugo]) {
        expectProblem(
          await send('get', `/internal/v1/spaces/${marketing.space.id}`, actor),
          404,
          'space.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/spaces/${marketing.space.id}/lists`, actor),
          404,
          'space.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/lists/${salonList.id}`, actor),
          404,
          'list.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/lists/${budget.id}`, actor),
          404,
          'list.not-found',
        );
      }
      expectProblem(
        await send('patch', `/internal/v1/spaces/${marketing.space.id}`, camille, {
          body: { name: 'Autre' },
        }),
        404,
        'space.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/spaces/${marketing.space.id}/grants`, camille),
        404,
        'space.not-found',
      );
      const spaces = await read(ListSpacesInternalResponse, '/internal/v1/spaces', camille, {
        limit: 100,
      });
      expect(spaces.items.map((space) => space.id)).not.toContain(marketing.space.id);

      const events = await eventsOf('space.deleted.v1', 'spaceId', marketing.space.id);
      expect(events).toHaveLength(1);
      expect(conforms(taskEventSchemas['space.deleted.v1'], events[0]?.payload)).toMatchObject({
        actor: { type: 'user', id: ines.userId },
        version: marketing.space.version + 1,
        spaceId: marketing.space.id,
      });
      // Only the list deleted on its own emitted list.deleted.v1.
      const deletedLists = (await outboxOf('spaceId', marketing.space.id)).filter(
        (row) => row.event_name === 'list.deleted.v1',
      );
      expect(deletedLists.map((row) => (row.payload as { listId: string }).listId)).toEqual([
        campagne.id,
      ]);
      const after = await storedLists([
        marketing.firstList.id,
        campagne.id,
        salonList.id,
        budget.id,
      ]);
      for (const id of [marketing.firstList.id, salonList.id, budget.id]) {
        expect(after.get(id), id).toMatchObject({
          version: listsBefore.get(id)?.version,
          deleted_by_id: ines.userId,
        });
        expect(after.get(id)?.deleted_at, id).not.toBeNull();
      }
      // A list deleted before keeps its own tombstone.
      expect(after.get(campagne.id)).toMatchObject({
        version: listsBefore.get(campagne.id)?.version,
        deleted_by_id: camille.userId,
      });
    });

    it('moves the tasks of its lists to the trash by the actor of the deletion, drops its pending access requests and those of its lists and tasks, and keeps the entries of a list deleted before', async () => {
      await jobsSettled();

      const entries = (await trashPageOf(camille, { limit: 100 })).items.filter((item) =>
        [tasks.a.key, tasks.b.key, tasks.c.key, tasks.d.key].includes(item.task.key),
      );
      const byKey = new Map(entries.map((item) => [item.task.key, item]));
      expect(byKey.size).toBe(4);
      for (const key of [tasks.a.key, tasks.c.key, tasks.d.key]) {
        expect(byKey.get(key), key).toMatchObject({
          list: { state: 'deleted' },
          trashedBy: { type: 'user', id: ines.userId },
        });
      }
      expect(byKey.get(tasks.b.key)).toMatchObject({
        list: { id: campagne.id, state: 'deleted' },
        trashedBy: { type: 'user', id: camille.userId },
        subtaskCount: 1,
      });
      expect(
        await countOf(`select count(*)::int as total from access_requests where space_id = $1`, [
          marketing.space.id,
        ]),
      ).toBe(0);
      expect((await storedTask(tasks.d.key))?.archived_at).not.toBeNull();
    });

    it('hides a private space from an admin of the organization, drops the pending request of a member who did not see it, and erases the deleted space that holds no task, keeping its prefix', async () => {
      const secret = await createSpace(camille, {
        name: 'Confidentiel',
        prefix: 'CNF',
        visibility: 'private',
      });
      const asked = await send('post', '/internal/v1/access-requests', hugo, {
        body: { spaceId: secret.space.id },
      });
      expect(asked.status, asked.text).toBe(202);
      const requests = async (): Promise<number> =>
        countOf('select count(*)::int as total from access_requests where space_id = $1', [
          secret.space.id,
        ]);
      expect(await requests()).toBe(1);

      expectProblem(await deleteSpaceRequest(secret.space.id, ines), 404, 'space.not-found');
      expect((await deleteSpaceRequest(secret.space.id, camille)).status).toBe(204);
      await jobsSettled();

      expect(await requests()).toBe(0);
      expect(
        await countOf('select count(*)::int as total from spaces where id = $1', [secret.space.id]),
      ).toBe(0);
      expect(
        await countOf('select count(*)::int as total from lists where id = $1', [
          secret.firstList.id,
        ]),
      ).toBe(0);
      expectProblem(
        await send('post', '/internal/v1/spaces', camille, {
          body: { name: 'Confidentiel bis', prefix: 'CNF' },
        }),
        409,
        'space.prefix-taken',
      );
    });
  });

  describe('the daily purge erases the entries deleted 30 days ago or more, in every organization', () => {
    it('erases a due entry with the system as actor, leaves a younger entry restorable, and enqueues nothing once nothing is due', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Purge du jour' });
      const old = await createTask(camille, list.id, { name: 'Vieille tâche', labels: ['Ancien'] });
      const oldChild = await createSubtask(old.key, { name: 'Vieille sous-tâche' });
      const older = await createTask(camille, list.id, { name: 'Plus vieille tâche' });
      const young = await createTask(camille, list.id, { name: 'Tâche récente' });
      const foreign = await createTask(
        solene,
        delta.firstList.id,
        { name: 'Vieille tâche Delta' },
        atelierDeltaId,
      );
      const oldEntry = await trashTask(old.key);
      const olderEntry = await trashTask(older.key);
      const youngEntry = await trashTask(young.key);
      const foreignEntry = entryAnswer(
        await trashRequest(foreign.key, solene, { organizationId: atelierDeltaId }),
      );
      const trashed = await storedTasks([old.key, oldChild.key]);
      await asSystem(
        `update trash_entries set trashed_at = trashed_at - interval '31 days' where id = any($1::uuid[])`,
        [[oldEntry.id, olderEntry.id, foreignEntry.id]],
      );
      await asSystem(
        `update trash_entries set trashed_at = trashed_at - interval '29 days' where id = $1`,
        [youngEntry.id],
      );
      const handler = service().get(ScheduleTrashPurgeHandler, { strict: false });
      const occurrence = (): Parameters<ScheduleTrashPurgeHandler['handle']>[0] => ({
        id: randomUUID(),
        queue: 'task.schedule-trash-purge',
        payload: null,
        organizationId: null,
        attempt: 1,
        signal: new AbortController().signal,
      });

      await handler.handle(occurrence());
      await jobsSettled();

      expect(await storedTasks([old.key, oldChild.key, older.key])).toEqual(new Map());
      expect(
        await countOf(
          `select count(*)::int as total from tasks
            where organization_id = $1 and key_prefix = split_part($2, '-', 1)
              and key_number = split_part($2, '-', 2)::int`,
          [atelierDeltaId, foreign.key],
        ),
      ).toBe(0);
      const system = { type: 'system', id: 'task-service' };
      const purged = await purgedOf(oldEntry.id);
      expect(purged.map((event) => event.key)).toEqual([old.key, oldChild.key]);
      for (const event of purged) {
        expect(event, event.key).toMatchObject({
          actor: system,
          entryId: oldEntry.id,
          rootKey: old.key,
          version: (trashed.get(event.key)?.version ?? 0) + 1,
        });
      }
      expect((await purgedOf(olderEntry.id))[0]).toMatchObject({ actor: system, key: older.key });
      expect((await purgedOf(foreignEntry.id))[0]).toMatchObject({
        actor: system,
        key: foreign.key,
        organizationId: atelierDeltaId,
      });
      expect((await trashPageOf(camille)).items.map((item) => item.id)).toEqual(
        expect.arrayContaining([youngEntry.id]) as unknown,
      );
      expect((await trashPageOf(camille)).items.map((item) => item.id)).not.toContain(oldEntry.id);
      expect(await restoreEntry(youngEntry.id)).toMatchObject({ task: { key: young.key } });

      const jobs = async (): Promise<number> =>
        countOf(`select count(*)::int as total from pgboss.job where name = $1`, [
          PURGE_TRASH_QUEUE,
        ]);
      const before = await jobs();
      await handler.handle(occurrence());
      expect(await jobs()).toBe(before);
    });

    it('enqueues the purge once for an occurrence that runs twice with the same job id', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Purge rejouée' });
      const task = await createTask(camille, list.id, { name: 'Tâche rejouée' });
      const entry = await trashTask(task.key);
      await asSystem(
        `update trash_entries set trashed_at = trashed_at - interval '40 days' where id = $1`,
        [entry.id],
      );
      const handler = service().get(ScheduleTrashPurgeHandler, { strict: false });
      const job = {
        id: randomUUID(),
        queue: 'task.schedule-trash-purge',
        payload: null,
        organizationId: null,
        attempt: 1,
        signal: new AbortController().signal,
      } as const;
      const jobs = async (): Promise<number> =>
        countOf(
          `select count(*)::int as total from pgboss.job
            where name = $1 and data ->> 'organizationId' = $2`,
          [PURGE_TRASH_QUEUE, atelierNordId],
        );

      const before = await jobs();
      await handler.handle(job);
      const once = await jobs();
      await handler.handle({ ...job, attempt: 2 });

      expect(once).toBe(before + 1);
      expect(await jobs()).toBe(once);
      await jobsSettled();
      expect(await storedTask(task.key)).toBeUndefined();
    });
  });

  describe('concurrent writers on a trash end in one consistent state, without a deadlock', () => {
    let list: ListBody;

    /**
     * Counts the live tasks under a parent in the trash.
     *
     * @returns The number of such tasks; whatever the order the writers met in, there is none.
     */
    async function liveUnderTrashed(): Promise<number> {
      return countOf(
        `select count(*)::int as total from tasks child
           join tasks parent
             on parent.organization_id = child.organization_id and parent.id = child.parent_id
          where child.organization_id = $1 and child.trash_entry_id is null
            and parent.trash_entry_id is not null`,
        [atelierNordId],
      );
    }

    it('deletes a task and creates a subtask under its subtask, in both orders: the creation that took the subtask first is deleted with it, the other answers 404 task.trashed', async () => {
      list = await createList(camille, produit.space.id, { name: 'Concurrence' });
      const createUnder = (key: string, name: string) => (): Promise<request.Response> =>
        send('post', `/internal/v1/tasks/${key}/subtasks`, camille, { body: { name } });

      const first = await createTask(camille, list.id, { name: 'Lot de test A' });
      const firstChild = await createSubtask(first.key, { name: 'Préparer le lot A' });
      const [trashFirst, createLate] = await behindTask(
        firstChild.key,
        () => trashRequest(first.key),
        createUnder(firstChild.key, 'Finitions du lot A'),
      );
      const firstEntry = entryAnswer(trashFirst);
      expect(firstEntry.subtaskCount).toBe(1);
      expectProblem(createLate, 404, 'task.trashed', { key: firstChild.key, rootKey: first.key });

      const second = await createTask(camille, list.id, { name: 'Lot de test B' });
      const secondChild = await createSubtask(second.key, { name: 'Préparer le lot B' });
      const [createEarly, trashSecond] = await behindTask(
        secondChild.key,
        createUnder(secondChild.key, 'Finitions du lot B'),
        () => trashRequest(second.key),
      );
      expect(createEarly.status, createEarly.text).toBe(201);
      const created = conforms(CreateSubtaskInternalResponse, bodyOf(createEarly));
      const secondEntry = entryAnswer(trashSecond);
      expect(secondEntry.subtaskCount).toBe(2);
      expect(await storedTask(created.key)).toMatchObject({
        trash_entry_id: secondEntry.id,
        parent_key: secondChild.key,
        version: created.version + 1,
      });
      expect((await trashedOf(secondEntry.id)).map((event) => event.key)).toEqual([
        second.key,
        secondChild.key,
        created.key,
      ]);
      expect(await liveUnderTrashed()).toBe(0);
    });

    it('races a deletion with a subtask creation, unforced: the subtask is deleted with it or the creation answers 404 task.trashed, and no live task is left under a task in the trash', async () => {
      for (let round = 1; round <= 4; round += 1) {
        const batch = await createTask(camille, list.id, { name: `Lot libre ${String(round)}` });
        const child = await createSubtask(batch.key, {
          name: `Lot libre ${String(round)} : préparation`,
        });

        const [trashed, created] = await Promise.all([
          trashRequest(batch.key),
          send('post', `/internal/v1/tasks/${child.key}/subtasks`, camille, {
            body: { name: `Lot libre ${String(round)} : finitions` },
          }),
        ]);

        const entry = entryAnswer(trashed);
        if (created.status === 201) {
          const subtask = conforms(CreateSubtaskInternalResponse, bodyOf(created));
          expect((await storedTask(subtask.key))?.trash_entry_id).toBe(entry.id);
          expect(entry.subtaskCount).toBe(2);
        } else {
          expectProblem(created, 404, 'task.trashed', { key: child.key });
          expect(entry.subtaskCount).toBe(1);
        }
      }
      expect(await liveUnderTrashed()).toBe(0);
    });

    it('deletes a task and moves its subtask to another list, in both orders: the move that took the subtask first stays live there, the other answers 404 task.trashed', async () => {
      const target = await createList(camille, produit.space.id, { name: 'Concurrence (cible)' });
      const moveTo = (key: string) => (): Promise<request.Response> =>
        send('patch', `/internal/v1/tasks/${key}`, camille, { body: { listId: target.id } });

      const first = await createTask(camille, list.id, { name: 'Lot de traduction A' });
      const firstMails = await createSubtask(first.key, { name: 'Traduire les emails A' });
      const firstSubject = await createSubtask(firstMails.key, { name: 'Traduire les objets A' });
      const [trashFirst, moveLate] = await behindTask(
        firstMails.key,
        () => trashRequest(first.key),
        moveTo(firstMails.key),
      );
      expect(entryAnswer(trashFirst).subtaskCount).toBe(2);
      expectProblem(moveLate, 404, 'task.trashed', { key: firstMails.key, rootKey: first.key });
      expect(await storedTask(firstSubject.key)).toMatchObject({ list_id: list.id });

      const second = await createTask(camille, list.id, { name: 'Lot de traduction B' });
      const secondMails = await createSubtask(second.key, { name: 'Traduire les emails B' });
      const secondSubject = await createSubtask(secondMails.key, { name: 'Traduire les objets B' });
      const [moveEarly, trashSecond] = await behindTask(
        secondMails.key,
        moveTo(secondMails.key),
        () => trashRequest(second.key),
      );
      expect(moveEarly.status, moveEarly.text).toBe(200);
      expect(conforms(UpdateTaskInternalResponse, bodyOf(moveEarly))).toMatchObject({
        key: secondMails.key,
        listId: target.id,
        parentKey: null,
      });
      expect(entryAnswer(trashSecond).subtaskCount).toBe(0);
      const moved = await storedTasks([secondMails.key, secondSubject.key]);
      for (const key of [secondMails.key, secondSubject.key]) {
        expect(moved.get(key), key).toMatchObject({ list_id: target.id, trash_entry_id: null });
      }
      expect(await liveUnderTrashed()).toBe(0);
    });

    it('serializes the restoration of an entry and the deletion of its list on the list: restored first, the job deletes the task again; deleted first, the restoration brings the list back and stops the job', async () => {
      for (const order of ['restoration first', 'deletion first'] as const) {
        const own = await createList(camille, produit.space.id, { name: `Course ${order}` });
        const task = await createTask(camille, own.id, { name: `Tâche de la course ${order}` });
        const entry = await trashTask(task.key);
        const restore = (): Promise<request.Response> => restoreRequest(entry.id);
        const remove = (): Promise<request.Response> => deleteListRequest(own.id);

        let restored: request.Response;
        let removed: request.Response;
        if (order === 'restoration first') {
          [restored, removed] = await behindList(own.id, restore, remove);
        } else {
          [removed, restored] = await behindList(own.id, remove, restore);
        }

        expect(removed.status, `${order}: ${removed.text}`).toBe(204);
        expect(restored.status, `${order}: ${restored.text}`).toBe(200);
        expect(
          conforms(RestoreTrashEntryInternalResponse, bodyOf(restored)).listRestored,
          order,
        ).toBe(order === 'deletion first');
        await jobsSettled();
        const stored = (await storedLists([own.id])).get(own.id);
        if (order === 'restoration first') {
          expect(stored?.deleted_at, order).not.toBeNull();
          expect((await storedTask(task.key))?.trash_entry_id, order).not.toBeNull();
          expect(await eventsOf('task.trashed.v1', 'key', task.key), order).toHaveLength(2);
        } else {
          expect(stored?.deleted_at, order).toBeNull();
          expect((await storedTask(task.key))?.trash_entry_id, order).toBeNull();
          expect(await eventsOf('task.trashed.v1', 'key', task.key), order).toHaveLength(1);
        }
      }
    });

    it('serializes the erasure and the restoration of one entry on its row: one wins, the other answers 404 trash-entry.not-found', async () => {
      const entryOf = async (
        name: string,
      ): Promise<{ readonly key: string; readonly id: string }> => {
        const task = await createTask(camille, list.id, { name });
        return { key: task.key, id: (await trashTask(task.key)).id };
      };

      const erasedFirst = await entryOf('Entrée effacée d’abord');
      const [erased, lost] = await behindEntry(
        erasedFirst.id,
        () => purgeRequest(erasedFirst.id),
        () => restoreRequest(erasedFirst.id),
      );
      expect(erased.status, erased.text).toBe(204);
      expectProblem(lost, 404, 'trash-entry.not-found');
      expect(await storedTask(erasedFirst.key)).toBeUndefined();

      const restoredFirst = await entryOf('Entrée restaurée d’abord');
      const [restored, missed] = await behindEntry(
        restoredFirst.id,
        () => restoreRequest(restoredFirst.id),
        () => purgeRequest(restoredFirst.id),
      );
      expect(restored.status, restored.text).toBe(200);
      expectProblem(missed, 404, 'trash-entry.not-found');
      expect(await storedTask(restoredFirst.key)).toMatchObject({ trash_entry_id: null });

      for (let round = 1; round <= 3; round += 1) {
        const free = await entryOf(`Entrée libre ${String(round)}`);
        const [byErasure, byRestoration] = await Promise.all([
          purgeRequest(free.id),
          restoreRequest(free.id),
        ]);
        const statuses = [byErasure.status, byRestoration.status];
        expect(
          [
            [204, 404],
            [404, 200],
          ],
          statuses.join(),
        ).toContainEqual(statuses);
        expect((await storedTask(free.key)) === undefined).toBe(byErasure.status === 204);
        expect(
          await countOf('select count(*)::int as total from trash_entries where id = $1', [
            free.id,
          ]),
        ).toBe(0);
      }
    });

    it('serializes a task creation and the deletion of its list on the list: created first, the job deletes the new task too; deleted first, the creation answers 404 list.not-found', async () => {
      for (const order of ['creation first', 'deletion first'] as const) {
        const own = await createList(camille, produit.space.id, { name: `Création ${order}` });
        const create = (): Promise<request.Response> =>
          send('post', `/internal/v1/lists/${own.id}/tasks`, camille, {
            body: { name: `Tâche créée, ${order}` },
          });
        const remove = (): Promise<request.Response> => deleteListRequest(own.id);

        let created: request.Response;
        let removed: request.Response;
        if (order === 'creation first') {
          [created, removed] = await behindList(own.id, create, remove);
        } else {
          [removed, created] = await behindList(own.id, remove, create);
        }

        expect(removed.status, `${order}: ${removed.text}`).toBe(204);
        await jobsSettled();
        if (order === 'creation first') {
          expect(created.status, created.text).toBe(201);
          const task = conforms(CreateTaskInternalResponse, bodyOf(created));
          expect((await storedTask(task.key))?.trash_entry_id).not.toBeNull();
        } else {
          expectProblem(created, 404, 'list.not-found');
        }
        expect(
          await countOf(
            'select count(*)::int as total from tasks where list_id = $1 and trash_entry_id is null',
            [own.id],
          ),
          order,
        ).toBe(0);
      }
    });

    it('moves every task once when a list and then its space are deleted at once: two jobs share one list, one entry and one event per task', async () => {
      const space = await createSpace(camille, {
        name: 'Doublon',
        prefix: 'DBL',
        icon: 'rocket',
        color: 'violet',
      });
      const own = await createList(camille, space.space.id, { name: 'Liste en double' });
      const tasks = [
        await createTask(camille, own.id, { name: 'Première en double' }),
        await createTask(camille, own.id, { name: 'Deuxième en double' }),
        await createTask(camille, own.id, { name: 'Troisième en double' }),
      ];
      await createSubtask(tasks[0]?.key ?? '', { name: 'Sous-tâche en double' });

      const byList = await deleteListRequest(own.id);
      const bySpace = await deleteSpaceRequest(space.space.id);
      expect(byList.status, byList.text).toBe(204);
      expect(bySpace.status, bySpace.text).toBe(204);
      await jobsSettled();

      for (const task of tasks) {
        expect(await eventsOf('task.trashed.v1', 'key', task.key), task.key).toHaveLength(1);
        expect((await storedTask(task.key))?.trash_entry_id, task.key).not.toBeNull();
      }
      expect(
        await countOf('select count(*)::int as total from trash_entries where list_id = $1', [
          own.id,
        ]),
      ).toBe(3);
      expect(await eventsOf('space.deleted.v1', 'spaceId', space.space.id)).toHaveLength(1);
    });
  });

  describe('a parent the caller does not see is refused as an unknown parent, whatever its state', () => {
    it('answers 422 task.parent-invalid, with the body of an unknown key, to a patch that names an archived task or a task in the trash of a list the caller has no role on, a task in the trash of a list the caller edits, or a task of a deleted list', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Rattachements' });
      const child = await createTask(camille, list.id, { name: 'Tâche à rattacher' });
      const hidden = {
        archived: await archiveTask(
          (await createTask(hugo, entretiens.id, { name: 'Notes archivées d’entretien' })).key,
          hugo,
        ),
        trashed: await createTask(hugo, entretiens.id, { name: 'Notes supprimées d’entretien' }),
        trashedHere: await createTask(camille, list.id, { name: 'Parent supprimé' }),
        deletedList: await createTask(
          camille,
          (await createList(camille, produit.space.id, { name: 'Liste supprimée' })).id,
          {
            name: 'Parent d’une liste supprimée',
          },
        ),
      };
      await trashTask(hidden.trashed.key, hugo);
      await trashTask(hidden.trashedHere.key);
      const deletedListId = hidden.deletedList.listId;
      expect((await deleteListRequest(deletedListId)).status).toBe(204);
      await jobsSettled();
      const total = await outboxTotal();
      const answer = async (parentKey: string): Promise<{ status: number; body: string }> => {
        const response = await send('patch', `/internal/v1/tasks/${child.key}`, camille, {
          body: { parentKey },
        });
        expectProblem(response, 422, 'task.parent-invalid');
        // Whatever the key it names, the body is the one of an unknown key.
        return {
          status: response.status,
          body: JSON.stringify(bodyOf(response)).split(parentKey).join('PARENT'),
        };
      };

      const unknown = await answer('CAD-99999');

      for (const [name, parent] of Object.entries(hidden)) {
        expect(await answer(parent.key), name).toEqual(unknown);
      }
      expect(await outboxTotal()).toBe(total);
      expect((await readTask(child.key)).parentKey).toBeNull();
    });
  });

  describe('trash_entries stays inside its organization', () => {
    it('shows, changes and creates nothing of Atelier Nord to a transaction of the second organization, as task_app, with row-level security forced', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Tâche isolée' });
      const entry = await trashTask(task.key);
      const foreign = await createTask(
        solene,
        delta.firstList.id,
        { name: 'Tâche isolée Delta' },
        atelierDeltaId,
      );
      const foreignEntry = entryAnswer(
        await trashRequest(foreign.key, solene, { organizationId: atelierDeltaId }),
      );
      const [policy] = await asSystem<{ readonly enabled: boolean; readonly forced: boolean }>(
        `select relrowsecurity as enabled, relforcerowsecurity as forced from pg_class
          where relname = 'trash_entries'`,
      );
      expect(policy).toEqual({ enabled: true, forced: true });
      expect(
        await countOf(
          'select count(*)::int as total from trash_entries where organization_id = $1',
          [atelierNordId],
        ),
      ).toBeGreaterThan(0);

      /** What a refused statement answers. */
      interface Refusal {
        readonly attempt: string;
        readonly code?: string;
        readonly constraint?: string;
        readonly accepted?: true;
      }
      const attemptsOf = async (
        client: TransactionClient,
        attempts: readonly (readonly [string, string, readonly unknown[]])[],
      ): Promise<Refusal[]> => {
        const refusals: Refusal[] = [];
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
        return refusals;
      };

      const seen = await inTenant(atelierDeltaId, async (client) => {
        const role = await client.query('select current_user::text as role');
        const rows = await client.query(
          'select organization_id::text as organization_id, id::text as id from trash_entries',
        );
        const updated = await client.query(
          'update trash_entries set task_count = task_count where organization_id = $1 returning id',
          [atelierNordId],
        );
        const deleted = await client.query('delete from trash_entries where id = $1 returning id', [
          entry.id,
        ]);
        const refusals = await attemptsOf(client, [
          [
            'an entry created for Atelier Nord',
            `insert into trash_entries (organization_id, root_task_id, list_id, task_count, trashed_at, trashed_by_type, trashed_by_id)
             values ($1, $2, $3, 1, now(), 'user', 'x')`,
            [atelierNordId, randomUUID(), randomUUID()],
          ],
        ]);
        return {
          role: (role.rows as readonly { readonly role: string }[])[0]?.role,
          rows: rows.rows as readonly { readonly organization_id: string; readonly id: string }[],
          updated: updated.rows.length,
          deleted: deleted.rows.length,
          refusals,
        };
      });
      const taskId = await taskIdOf(task.key);
      const pointed = await inTenant(atelierNordId, async (client) =>
        attemptsOf(client, [
          [
            'a task of Atelier Nord pointed at an entry of the second organization',
            'update tasks set trash_entry_id = $2 where organization_id = $1 and id = $3',
            [atelierNordId, foreignEntry.id, taskId],
          ],
        ]),
      );

      expect(seen.role).toBe('task_app');
      expect(seen.rows.map((row) => row.organization_id)).toEqual(
        seen.rows.map(() => atelierDeltaId),
      );
      expect(seen.rows.map((row) => row.id)).toContain(foreignEntry.id);
      expect(seen.rows.map((row) => row.id)).not.toContain(entry.id);
      expect(seen.updated).toBe(0);
      expect(seen.deleted).toBe(0);
      expect(seen.refusals).toEqual([
        { attempt: 'an entry created for Atelier Nord', code: '42501', constraint: undefined },
      ]);
      expect(pointed).toEqual([
        {
          attempt: 'a task of Atelier Nord pointed at an entry of the second organization',
          code: '23503',
          constraint: 'tasks_trash_entry_fkey',
        },
      ]);
      expect((await storedTask(task.key))?.trash_entry_id).toBe(entry.id);
    });
  });

  describe('the removal of a member unassigns them from a task in the trash without telling a consumer', () => {
    it('unassigns Mathis from a live task with task.updated.v1 and from a task in the trash at its next version without one, then restores the task without him', async () => {
      const live = await createTask(camille, sprint14.id, {
        name: 'Tâche vivante de Mathis',
        assigneeIds: [mathis.userId],
      });
      const doomed = await createTask(camille, sprint14.id, {
        name: 'Tâche supprimée de Mathis',
        assigneeIds: [mathis.userId, lea.userId],
      });
      const entry = await trashTask(doomed.key);
      const trashed = await storedTask(doomed.key);
      const updates = async (key: string): Promise<number> =>
        (await eventsOf('task.updated.v1', 'key', key)).length;
      const liveUpdates = await updates(live.key);
      const doomedUpdates = await updates(doomed.key);

      publishMember('removed', atelierNordId, mathis, 'member', 2);
      await vi.waitFor(
        async () => {
          expect(
            await countOf(`select count(*)::int as total from task_assignees where user_id = $1`, [
              mathis.userId,
            ]),
          ).toBe(0);
        },
        { timeout: 60_000, interval: 250 },
      );

      expect(await updates(live.key)).toBe(liveUpdates + 1);
      expect(await updates(doomed.key)).toBe(doomedUpdates);
      expect(await storedTask(doomed.key)).toMatchObject({
        version: (trashed?.version ?? 0) + 1,
        trash_entry_id: entry.id,
      });
      expect(
        (
          await asSystem<{ readonly user_id: string }>(
            `select user_id::text as user_id from task_assignees where task_id = $1`,
            [await taskIdOf(doomed.key)],
          )
        ).map((row) => row.user_id),
      ).toEqual([lea.userId]);

      const restored = await restoreEntry(entry.id);
      expect(restored.task.assignees.map((person) => person.userId)).toEqual([lea.userId]);
      expect(restored.task.version).toBe((trashed?.version ?? 0) + 2);
      const [event] = await restoredSince(doomed.key, 0);
      expect(event).toMatchObject({ assigneeIds: [lea.userId], version: restored.task.version });
    });
  });

  describe('the writes of the trash are behind a switch', () => {
    it('answers the four writes as an unknown route while TRASH_WRITES_ENABLED is false, changes nothing, and still serves the page, the restoration and the erasure', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Interrupteur' });
      const space = await createSpace(camille, {
        name: 'Espace de l’interrupteur',
        prefix: 'SWI',
        icon: 'rocket',
        color: 'violet',
      });
      const victim = await createTask(camille, list.id, { name: 'Tâche qui reste vivante' });
      const toRestore = await createTask(camille, list.id, { name: 'À restaurer' });
      const toErase = await createTask(camille, list.id, { name: 'À effacer' });
      const toKeep = await createTask(camille, list.id, { name: 'À garder dans la corbeille' });
      const restoreEntryId = (await trashTask(toRestore.key)).id;
      const eraseEntryId = (await trashTask(toErase.key)).id;
      const keepEntryId = (await trashTask(toKeep.key)).id;
      await jobsSettled();

      vi.stubEnv('TRASH_WRITES_ENABLED', 'false');
      const off = await startApplication().finally(() => {
        vi.stubEnv('TRASH_WRITES_ENABLED', 'true');
      });
      try {
        const total = await outboxTotal();
        const writes: readonly (readonly [HttpMethod, string, object | undefined])[] = [
          ['post', `/internal/v1/tasks/${victim.key}/trash`, {}],
          ['delete', `/internal/v1/lists/${list.id}`, undefined],
          ['delete', `/internal/v1/spaces/${space.space.id}`, undefined],
          ['post', '/internal/v1/trash/empty', {}],
        ];
        const unknown = await send('get', '/internal/v1/no-such-route', camille, { target: off });
        expectProblem(unknown, 404, 'http.not-found');
        for (const [method, path, body] of writes) {
          const response = await send(method, path, camille, { body, target: off });
          expectProblem(response, 404, 'http.not-found');
          expect(bodyOf(response), `${method} ${path}`).toMatchObject({
            title: 'Not Found',
            type: problemOf(unknown).type,
            detail: `Cannot ${method.toUpperCase()} ${path}`,
          });
          // After the guard of the internal token: no token, no answer about the route.
          const bare = request(off.getHttpServer())[method](path);
          const anonymous = await (body === undefined ? bare : bare.send(body));
          expect(anonymous.status, `${method} ${path}`).toBe(401);
        }

        expect(await outboxTotal()).toBe(total);
        expect(await readTask(victim.key)).toMatchObject({ key: victim.key });
        expect(await readList(list.id)).toMatchObject({ id: list.id, archivedAt: null });
        expect(
          (await storedLists([list.id])).get(list.id)?.deleted_at,
          'the list is not a tombstone',
        ).toBeNull();
        expect((await trashPageOf(camille, { limit: 100 })).items.map((item) => item.id)).toEqual(
          expect.arrayContaining([restoreEntryId, eraseEntryId, keepEntryId]) as unknown,
        );

        // The page, the restoration and the erasure answer as they do with the switch on.
        const page = await read(
          ListTrashInternalResponse,
          '/internal/v1/trash/entries',
          camille,
          { limit: 100 },
          { target: off },
        );
        expect(page.items.map((item) => item.id)).toEqual(
          expect.arrayContaining([restoreEntryId, eraseEntryId, keepEntryId]) as unknown,
        );
        const restored = await restoreRequest(restoreEntryId, camille, { target: off });
        expect(restored.status, restored.text).toBe(200);
        expect(conforms(RestoreTrashEntryInternalResponse, bodyOf(restored)).task.key).toBe(
          toRestore.key,
        );
        const erased = await send('delete', `/internal/v1/trash/entries/${eraseEntryId}`, camille, {
          target: off,
        });
        expect(erased.status, erased.text).toBe(204);
        expectProblem(
          await restoreRequest(randomUUID(), camille, { target: off }),
          404,
          'trash-entry.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/tasks/${toKeep.key}`, camille, { target: off }),
          404,
          'task.trashed',
        );
      } finally {
        await off.close();
      }

      expect(await storedTask(toRestore.key)).toMatchObject({ trash_entry_id: null });
      expect(await storedTask(toErase.key)).toBeUndefined();
      expect((await storedTask(toKeep.key))?.trash_entry_id).toBe(keepEntryId);
      // With the switch on again, the four routes answer.
      expect((await trashRequest(victim.key)).status).toBe(200);
    });
  });

  describe('a restoration never exposes the tasks a deletion job has not moved', () => {
    it('answers 404 trash-entry.not-found to the restoration of an entry of a deleted list while its job still has tasks to move, and restores it once the job finished, leaving the other tasks in the trash', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Suppression en cours' });
      const early = await createTask(camille, list.id, { name: 'Tâche déjà supprimée' });
      const earlyEntry = await trashTask(early.key);
      const pending = [
        await createTask(camille, list.id, { name: 'Reste à déplacer 1' }),
        await createTask(camille, list.id, { name: 'Reste à déplacer 2' }),
        await createTask(camille, list.id, { name: 'Reste à déplacer 3' }),
      ];
      const held = await taskIdOf(pending[1]?.key ?? '');
      const waitsBefore = await lockWaits();

      // The job cannot move the tasks while a task row is held: it waits for it, with the list
      // deleted and its three tasks still out of the trash.
      const during = await whileHeld([taskLock(held)], async () => {
        const deleted = await deleteListRequest(list.id);
        expect(deleted.status, deleted.text).toBe(204);
        await waitForLockWait(waitsBefore);
        const total = await outboxTotal();
        const refused = await restoreRequest(earlyEntry.id);
        const unknown = await restoreRequest(randomUUID());
        const reported = await send(
          'post',
          `/internal/v1/trash/entries/${earlyEntry.id}/restore?reportNotReady=true`,
          camille,
          { body: {} },
        );
        const hidden = await send(
          'post',
          `/internal/v1/trash/entries/${randomUUID()}/restore?reportNotReady=true`,
          camille,
          { body: {} },
        );
        return {
          refused,
          reported,
          hidden,
          unknown,
          appended: (await outboxTotal()) - total,
          list: (await storedLists([list.id])).get(list.id),
          early: await storedTask(early.key),
          waiting: await countOf(
            'select count(*)::int as total from tasks where list_id = $1 and trash_entry_id is null',
            [list.id],
          ),
        };
      });

      expectProblem(during.refused, 404, 'trash-entry.not-found');
      expectProblem(during.reported, 409, 'trash-entry.not-restorable-yet');
      expectProblem(during.hidden, 404, 'trash-entry.not-found');
      expect(problemOf(during.refused)).toEqual(problemOf(during.unknown));
      expect(during.appended).toBe(0);
      expect(during.list?.deleted_at).not.toBeNull();
      expect(during.early?.trash_entry_id).toBe(earlyEntry.id);
      expect(during.waiting).toBe(3);

      await jobsSettled();
      const restored = await restoreEntry(earlyEntry.id);

      expect(restored).toMatchObject({
        task: { key: early.key },
        listRestored: true,
        spaceRestored: false,
      });
      for (const task of pending) {
        expect((await storedTask(task.key))?.trash_entry_id, task.key).not.toBeNull();
      }
      expect(await storedTask(early.key)).toMatchObject({ trash_entry_id: null });
    });
  });

  describe('a restored space and list republish who reaches them', () => {
    it('appends space.access-republished.v1 and list.access-changed.v1 with the grants as they stand, between the restored events, and leaves a member removed meanwhile out of every snapshot', async () => {
      const space = await createSpace(camille, {
        name: 'Atelier de service',
        prefix: 'ATS',
        icon: 'rocket',
        color: 'violet',
      });
      const list = await createList(camille, space.space.id, { name: 'Chantiers' });
      const task = await createTask(camille, list.id, { name: 'Chantier de rénovation' });
      await grant(camille, 'spaces', space.space.id, theo.userId, 'comment');
      await grant(camille, 'spaces', space.space.id, lea.userId, 'view');
      await grant(camille, 'lists', list.id, theo.userId, 'view');
      await grant(camille, 'lists', list.id, hugo.userId, 'comment');
      expect((await deleteSpaceRequest(space.space.id)).status).toBe(204);
      await jobsSettled();
      const entry = (await trashPageOf(camille, { limit: 100 })).items.find(
        (item) => item.task.key === task.key,
      );
      expect(entry?.list.state).toBe('deleted');

      // Théo leaves the organization while the space is deleted, and comes back with a new
      // membership: his grants are gone, and the removal announced their end for the tombstones
      // (the access events, with him in `changedUserIds`) but no content change of the space.
      const grantsOf = async (table: 'space_grants' | 'list_grants'): Promise<number> =>
        countOf(`select count(*)::int as total from ${table} where user_id = $1`, [theo.userId]);
      expect(await grantsOf('space_grants')).toBe(1);
      expect(await grantsOf('list_grants')).toBe(1);
      const beforeRemoval = await lastEventId();
      publishMember('removed', atelierNordId, theo, 'member', 2);
      await vi.waitFor(
        async () => {
          expect(await grantsOf('space_grants')).toBe(0);
          expect(await grantsOf('list_grants')).toBe(0);
          expect(await activeMembers(atelierNordId)).not.toContain(theo.userId);
        },
        { timeout: 60_000, interval: 250 },
      );
      const removal = (await eventsAfter(beforeRemoval)).filter(
        (row) => (row.payload as { spaceId?: string }).spaceId === space.space.id,
      );
      expect(removal.map((row) => row.event_name).sort()).toEqual([
        'list.access-changed.v1',
        'space.access-changed.v1',
      ]);
      for (const row of removal) {
        const payload = conforms(
          row.event_name === 'space.access-changed.v1'
            ? taskEventSchemas['space.access-changed.v1']
            : taskEventSchemas['list.access-changed.v1'],
          row.payload,
        );
        expect(payload.changedUserIds, row.event_name).toEqual([theo.userId]);
        expect(payload.actor, row.event_name).toEqual({ type: 'system', id: 'task-service' });
        expect(JSON.stringify(payload.grants), row.event_name).not.toContain(theo.userId);
      }
      publishMember('joined', atelierNordId, theoAgain, 'member', 3);
      await vi.waitFor(
        async () => {
          expect(await activeMembers(atelierNordId)).toContain(theo.userId);
        },
        { timeout: 60_000, interval: 250 },
      );
      const marker = await lastEventId();

      const restored = await restoreEntry(entry?.id ?? '');

      expect(restored).toMatchObject({ listRestored: true, spaceRestored: true });
      const events = await eventsAfter(marker);
      expect(events.map((row) => row.event_name)).toEqual([
        'space.restored.v1',
        'space.access-republished.v1',
        'list.restored.v1',
        'list.access-changed.v1',
        'task.restored.v1',
      ]);
      const [spaceRestored, spaceAccess, listRestored, listAccess] = events;
      const spaceEvent = conforms(taskEventSchemas['space.restored.v1'], spaceRestored?.payload);
      const spaceGrants = conforms(
        taskEventSchemas['space.access-republished.v1'],
        spaceAccess?.payload,
      );
      const listEvent = conforms(taskEventSchemas['list.restored.v1'], listRestored?.payload);
      const listGrants = conforms(taskEventSchemas['list.access-changed.v1'], listAccess?.payload);
      expect(spaceGrants).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        spaceId: space.space.id,
        version: spaceEvent.version,
        grants: [{ userId: lea.userId, role: 'view' }],
      });
      expect(listGrants).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        listId: list.id,
        spaceId: space.space.id,
        version: listEvent.version,
        organizationAccess: true,
        grants: [{ userId: hugo.userId, role: 'comment' }],
      });
      expect(JSON.stringify(events.map((row) => row.payload))).not.toContain(theo.userId);
    });
  });

  describe('the purge erases an oversized entry whole, alone in its batch, root first', () => {
    it('erases an entry of more than 500 tasks, archived subtasks included, alone and whole in one batch committed at once, with task.purged.v1 root first then by depth then by id, and the younger due entry in the next batch', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Gros dossier' });
      const root = await createTask(camille, list.id, {
        name: 'Dossier de reprise',
        subtasks: Array.from({ length: 25 }, (_, index) => ({ name: `Lot ${String(index + 1)}` })),
      });
      const children = (await subtasksOf(root.key)).keys;
      expect(children).toHaveLength(25);
      const parents = new Map<string, string>(children.map((key) => [key, root.key]));
      for (let start = 0; start < children.length; start += 5) {
        await Promise.all(
          children.slice(start, start + 5).map(async (child) => {
            for (let number = 1; number <= 20; number += 1) {
              const leaf = await createSubtask(child, {
                name: `Tâche ${String(number)} du lot ${child}`,
              });
              parents.set(leaf.key, child);
            }
          }),
        );
      }
      for (const child of children.slice(0, 3)) {
        await archiveTask(child);
      }
      const big = await trashTask(root.key);
      expect(big.subtaskCount).toBe(525);
      const small = await createTask(camille, list.id, {
        name: 'Petit dossier',
        subtasks: [{ name: 'Un' }, { name: 'Deux' }],
      });
      const smallKeys = [small.key, ...(await subtasksOf(small.key)).keys];
      const smallEntry = await trashTask(small.key);
      await asSystem(
        `update trash_entries set trashed_at = trashed_at - interval '32 days' where id = $1`,
        [big.id],
      );
      await asSystem(
        `update trash_entries set trashed_at = trashed_at - interval '31 days' where id = $1`,
        [smallEntry.id],
      );
      // The order of the events: the root, then each depth, then the ids.
      const members = await asSystem<{ readonly key: string; readonly id: string }>(
        `select key_prefix || '-' || key_number as key, id::text as id from tasks
          where organization_id = $1 and trash_entry_id = $2`,
        [atelierNordId, big.id],
      );
      expect(members).toHaveLength(526);
      const depthOf = (key: string): number => {
        const parent = parents.get(key);
        return parent === undefined ? 0 : 1 + depthOf(parent);
      };
      const treeOrder = [...members]
        .sort(
          (left, right) =>
            depthOf(left.key) - depthOf(right.key) ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
        )
        .map((member) => member.key);
      expect(treeOrder[0]).toBe(root.key);
      const batch = service().get(PurgeTrashBatch, { strict: false });
      const run = (): Promise<unknown> =>
        runWithOrganizationContext(contextOf(atelierNordId), () =>
          batch.execute({ organizationId: atelierNordId }),
        );
      const remaining = async (): Promise<number> =>
        countOf('select count(*)::int as total from tasks where trash_entry_id = $1', [big.id]);
      const lastLeaf = [...parents.keys()].at(-1) ?? '';
      const waits = await lockWaits();

      // The batch needs a leaf another transaction holds: it waits with nothing of the entry
      // erased or announced, since the whole entry commits at once.
      const during = await whileHeld([taskLock(await taskIdOf(lastLeaf))], async () => {
        const first = run();
        await waitForLockWait(waits);
        return { first, remaining: await remaining(), purged: (await purgedOf(big.id)).length };
      });
      const first = await during.first;

      expect(during.remaining).toBe(526);
      expect(during.purged).toBe(0);
      expect(first).toEqual({
        outcome: 'purged',
        entries: 1,
        tasks: 526,
        listsPurged: 0,
        spacesPurged: 0,
      });
      expect(await remaining()).toBe(0);
      expect(
        await countOf('select count(*)::int as total from trash_entries where id = $1', [big.id]),
      ).toBe(0);
      expect(await storedTasks([root.key, ...parents.keys()])).toEqual(new Map());
      const events = await purgedOf(big.id);
      expect(events.map((event) => event.key)).toEqual(treeOrder);
      for (const event of events) {
        expect(event.actor).toEqual({ type: 'system', id: 'task-service' });
        expect(event.rootKey).toBe(root.key);
        expect(event.parentKey, event.key).toBe(parents.get(event.key) ?? null);
      }
      // The younger entry was left to the next batch, untouched.
      expect(await purgedOf(smallEntry.id)).toEqual([]);
      expect((await storedTasks(smallKeys)).size).toBe(3);

      expect(await run()).toMatchObject({ outcome: 'purged', entries: 1, tasks: 3 });
      const smallEvents = (await purgedOf(smallEntry.id)).map((event) => event.key);
      expect(smallEvents[0]).toBe(small.key);
      expect([...smallEvents].sort()).toEqual([...smallKeys].sort());
      expect(await storedTasks(smallKeys)).toEqual(new Map());
    });
  });

  describe('an access request never waits for its target, and no pending request outlives a deletion', () => {
    /**
     * Counts the pending requests that name a target.
     *
     * @param column - The column that names it.
     * @param value - The list id, the space id or the task key.
     * @returns The count.
     */
    async function pendingFor(
      column: 'list_id' | 'space_id' | 'task_key',
      value: string,
    ): Promise<number> {
      return countOf(
        `select count(*)::int as total from access_requests where state = 'pending' and ${column} = $1`,
        [value],
      );
    }

    /**
     * Counts the pending requests of one target, whatever names it too (a request of a list or a
     * task names its space, a request of a task its list).
     *
     * @param target - What the request is for.
     * @param targetId - The id of the space, the list or the task.
     * @returns The count.
     */
    async function pendingOf(target: 'space' | 'list' | 'task', targetId: string): Promise<number> {
      return countOf(
        `select count(*)::int as total from access_requests
          where state = 'pending' and target = $1 and target_id = $2`,
        [target, targetId],
      );
    }

    /**
     * Makes a request and a deletion of its target meet: the request committed before the
     * deletion started, or the deletion under way (queued behind a writer that holds the row of
     * the target) while the request is made, which then answers at once.
     *
     * @param order - Which of the two comes first.
     * @param lock - The statement that holds the row of the target, for `whileHeld`.
     * @param ask - The request.
     * @param remove - The deletion.
     * @returns Both answers.
     */
    async function meet(
      order: 'request first' | 'deletion under way',
      lock: readonly [string, readonly unknown[]],
      ask: () => Promise<request.Response>,
      remove: () => Promise<request.Response>,
    ): Promise<{ readonly asked: request.Response; readonly removed: request.Response }> {
      if (order === 'request first') {
        const asked = await ask();
        return { asked, removed: await remove() };
      }
      const waits = await lockWaits();
      const raced = await whileHeld([lock], async () => {
        const removal = remove();
        await waitForLockWait(waits);
        // Answered while the deletion still waits behind the held row.
        return { removal, asked: await ask() };
      });
      return { asked: raced.asked, removed: await raced.removal };
    }

    it('leaves no pending request on a list whose deletion commits after the request or is under way during it, and answers the same 202', async () => {
      for (const order of ['request first', 'deletion under way'] as const) {
        const own = await createList(camille, produit.space.id, { name: `Demande, ${order}` });
        const { asked, removed } = await meet(
          order,
          listLock(own.id),
          () => send('post', '/internal/v1/access-requests', rose, { body: { listId: own.id } }),
          () => deleteListRequest(own.id),
        );

        expect(asked.status, `${order}: ${asked.text}`).toBe(202);
        expect(asked.text).toBe('');
        expect(removed.status, `${order}: ${removed.text}`).toBe(204);
        await jobsSettled();
        expect(await pendingFor('list_id', own.id), order).toBe(0);
      }
    });

    it('leaves no pending request on a space whose deletion commits after the request or is under way during it, and answers the same 202', async () => {
      for (const [index, order] of (['request first', 'deletion under way'] as const).entries()) {
        const own = await createSpace(camille, {
          name: `Espace discret ${String(index + 1)}`,
          prefix: index === 0 ? 'DSA' : 'DSB',
          visibility: 'private',
        });
        const { asked, removed } = await meet(
          order,
          spaceLock(own.space.id),
          () =>
            send('post', '/internal/v1/access-requests', hugo, { body: { spaceId: own.space.id } }),
          () => deleteSpaceRequest(own.space.id),
        );

        expect(asked.status, `${order}: ${asked.text}`).toBe(202);
        expect(asked.text).toBe('');
        expect(removed.status, `${order}: ${removed.text}`).toBe(204);
        await jobsSettled();
        expect(await pendingFor('space_id', own.space.id), order).toBe(0);
      }
    });

    it('leaves no pending request on a task whose trash commits after the request or is under way during it, and answers the same 202', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Demandes de tâches' });
      for (const order of ['request first', 'deletion under way'] as const) {
        const task = await createTask(camille, list.id, { name: `Tâche demandée, ${order}` });
        const { asked, removed } = await meet(
          order,
          taskLock(await taskIdOf(task.key)),
          () =>
            send('post', '/internal/v1/access-requests', nadia, { body: { taskKey: task.key } }),
          () => trashRequest(task.key),
        );

        expect(asked.status, `${order}: ${asked.text}`).toBe(202);
        expect(asked.text).toBe('');
        expect(removed.status, `${order}: ${removed.text}`).toBe(200);
        await jobsSettled();
        expect(await pendingFor('task_key', task.key), order).toBe(0);
      }
    });

    it('answers 202 at once without storing anything for a list, a task or a space another transaction is writing, as for an unknown target, and stores the request once the writer is gone', async () => {
      const own = await createSpace(camille, {
        name: 'Espace en écriture',
        prefix: 'ECR',
        visibility: 'private',
      });
      const task = await createTask(camille, own.firstList.id, { name: 'Tâche en écriture' });
      const taskId = await taskIdOf(task.key);
      const targets: readonly {
        readonly label: string;
        readonly requester: Person;
        readonly body: object;
        readonly unknown: object;
        readonly lock: string;
        readonly lockParams: readonly unknown[];
        readonly pending: () => Promise<number>;
      }[] = [
        {
          label: 'list held FOR NO KEY UPDATE',
          requester: rose,
          body: { listId: own.firstList.id },
          unknown: { listId: randomUUID() },
          lock: 'select 1 from lists where organization_id = $1 and id = $2 for no key update',
          lockParams: [atelierNordId, own.firstList.id],
          pending: () => pendingOf('list', own.firstList.id),
        },
        {
          label: 'task held FOR UPDATE',
          requester: nadia,
          body: { taskKey: task.key },
          unknown: { taskKey: 'ECR-999' },
          lock: 'select 1 from tasks where organization_id = $1 and id = $2 for update',
          lockParams: [atelierNordId, taskId],
          pending: () => pendingOf('task', taskId),
        },
        {
          label: 'space held FOR NO KEY UPDATE',
          requester: hugo,
          body: { spaceId: own.space.id },
          unknown: { spaceId: randomUUID() },
          lock: 'select 1 from spaces where organization_id = $1 and id = $2 for no key update',
          lockParams: [atelierNordId, own.space.id],
          pending: () => pendingOf('space', own.space.id),
        },
      ];

      for (const target of targets) {
        const marker = await lastEventId();
        const held = await whileHeld([[target.lock, target.lockParams]], async () => {
          const started = performance.now();
          const asked = await send('post', '/internal/v1/access-requests', target.requester, {
            body: target.body,
          });
          return {
            asked,
            ms: performance.now() - started,
            pending: await target.pending(),
            events: await eventsAfter(marker),
          };
        });
        const unknown = await send('post', '/internal/v1/access-requests', target.requester, {
          body: target.unknown,
        });

        expect(held.asked.status, `${target.label}: ${held.asked.text}`).toBe(202);
        expect(held.asked.text, target.label).toBe('');
        expect(held.ms, target.label).toBeLessThan(2_500);
        expect(held.pending, target.label).toBe(0);
        expect(held.events, target.label).toEqual([]);
        expect(unknown.status, target.label).toBe(202);
        expect(unknown.text, target.label).toBe('');
        expect(await target.pending(), target.label).toBe(0);
        expect(await eventsAfter(marker), target.label).toEqual([]);

        // Without a writer, the same request is stored and announced.
        const again = await send('post', '/internal/v1/access-requests', target.requester, {
          body: target.body,
        });
        expect(again.status, `${target.label}: ${again.text}`).toBe(202);
        expect(await target.pending(), target.label).toBe(1);
        expect(
          (await eventsAfter(marker)).map((row) => row.event_name),
          target.label,
        ).toEqual([
          target.label.startsWith('list')
            ? 'list.access-requested.v1'
            : target.label.startsWith('task')
              ? 'task.access-requested.v1'
              : 'space.access-requested.v1',
        ]);
      }
    });
  });

  describe('the last erasures of a deleted list serialize on the list', () => {
    it('erases the tombstone when two transactions erase the last two entries of a deleted list at once, in both orders', async () => {
      for (const order of ['first entry first', 'second entry first'] as const) {
        const own = await createList(camille, produit.space.id, {
          name: `Dernières entrées, ${order}`,
        });
        await createTask(camille, own.id, { name: `Première, ${order}` });
        await createTask(camille, own.id, { name: `Deuxième, ${order}` });
        expect((await deleteListRequest(own.id)).status).toBe(204);
        await jobsSettled();
        const entries = (await trashPageOf(camille, { limit: 100 })).items
          .filter((item) => item.list.id === own.id)
          .map((item) => item.id);
        expect(entries).toHaveLength(2);
        const [one, other] = order === 'first entry first' ? entries : [...entries].reverse();

        const [byOne, byOther] = await behindList(
          own.id,
          () => purgeRequest(one ?? ''),
          () => purgeRequest(other ?? ''),
        );

        expect(byOne.status, `${order}: ${byOne.text}`).toBe(204);
        expect(byOther.status, `${order}: ${byOther.text}`).toBe(204);
        expect((await storedLists([own.id])).size, order).toBe(0);
        expect(
          await countOf('select count(*)::int as total from tasks where list_id = $1', [own.id]),
        ).toBe(0);
      }
    });
  });

  describe('a restoration and the erasure of its parent entry do not deadlock', () => {
    it('completes both when a child entry is restored while the entry of its parent is erased, in both orders', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Parents et enfants' });
      for (const order of ['erasure first', 'restoration first'] as const) {
        const parent = await createTask(camille, list.id, { name: `Parent, ${order}` });
        const child = await createSubtask(parent.key, { name: `Enfant, ${order}` });
        const childEntry = await trashTask(child.key);
        const parentEntry = await trashTask(parent.key);
        const childId = await taskIdOf(child.key);
        const restore = (): Promise<request.Response> => restoreRequest(childEntry.id);
        const erase = (): Promise<request.Response> => purgeRequest(parentEntry.id);

        const [restored, erased] = await inOrderBehind(
          'select 1 from tasks where organization_id = $1 and id = $2 for update',
          [atelierNordId, childId],
          order === 'erasure first' ? erase : restore,
          order === 'erasure first' ? restore : erase,
        ).then(([first, second]): [request.Response, request.Response] =>
          order === 'erasure first' ? [second, first] : [first, second],
        );

        expect(erased.status, `${order}: ${erased.text}`).toBe(204);
        expect(restored.status, `${order}: ${restored.text}`).toBe(200);
        expect(conforms(RestoreTrashEntryInternalResponse, bodyOf(restored)).task).toMatchObject({
          key: child.key,
          parentKey: null,
        });
        expect(await storedTask(parent.key)).toBeUndefined();
        expect(await storedTask(child.key)).toMatchObject({
          trash_entry_id: null,
          parent_key: null,
        });
      }
    });
  });

  describe('a write on a private list or space the caller does not see does not wait for a lock', () => {
    it('answers 404 at once, like an unknown id, to the writes of a list and of a space another transaction holds locked', async () => {
      const unknownList = randomUUID();
      const unknownSpace = randomUUID();
      const writes = (
        listId: string,
        spaceId: string,
      ): readonly (readonly [string, HttpMethod, string, object | undefined])[] => [
        ['list', 'patch', `/internal/v1/lists/${listId}`, { color: 'azur' }],
        ['list', 'post', `/internal/v1/lists/${listId}/archive`, {}],
        ['list', 'post', `/internal/v1/lists/${listId}/unarchive`, {}],
        ['list', 'delete', `/internal/v1/lists/${listId}`, undefined],
        ['list', 'put', `/internal/v1/lists/${listId}/grants/${lea.userId}`, { role: 'view' }],
        ['list', 'delete', `/internal/v1/lists/${listId}/grants/${lea.userId}`, undefined],
        ['space', 'patch', `/internal/v1/spaces/${spaceId}`, { name: 'Autre nom' }],
        ['space', 'delete', `/internal/v1/spaces/${spaceId}`, undefined],
        ['space', 'put', `/internal/v1/spaces/${spaceId}/grants/${lea.userId}`, { role: 'view' }],
        ['space', 'delete', `/internal/v1/spaces/${spaceId}/grants/${lea.userId}`, undefined],
      ];
      const answers = async (
        listId: string,
        spaceId: string,
        actor: Person,
      ): Promise<
        { readonly label: string; readonly response: request.Response; readonly ms: number }[]
      > => {
        const results: { label: string; response: request.Response; ms: number }[] = [];
        for (const [kind, method, path, body] of writes(listId, spaceId)) {
          const started = performance.now();
          const response = await send(method, path, actor, { body });
          results.push({
            label: `${kind} ${method} ${path}`,
            response,
            ms: performance.now() - started,
          });
        }
        return results;
      };
      const unknown = await answers(unknownList, unknownSpace, camille);

      const held = await whileHeld(
        [listLock(entretiens.id), spaceLock(recherche.space.id)],
        async () => ({
          camille: await answers(entretiens.id, recherche.space.id, camille),
          chloe: await answers(entretiens.id, recherche.space.id, chloe),
        }),
      );

      for (const [who, results] of Object.entries(held)) {
        for (const [index, result] of results.entries()) {
          const code = result.label.startsWith('list') ? 'list.not-found' : 'space.not-found';
          expectProblem(result.response, 404, code);
          expect(result.ms, `${who}: ${result.label}`).toBeLessThan(2500);
          expect(problemOf(result.response), `${who}: ${result.label}`).toEqual(
            problemOf(unknown[index]?.response ?? result.response),
          );
        }
      }
    });
  });

  describe('a move out of a list cannot strand a task in a deleted list', () => {
    it('answers 404 task.not-found to a move whose source list was deleted before it took its locks, and keeps the task for the deletion job', async () => {
      const source = await createList(camille, produit.space.id, { name: 'Liste à quitter' });
      const target = await createList(camille, produit.space.id, { name: 'Liste d’arrivée' });
      const task = await createTask(camille, source.id, { name: 'Tâche qui part' });
      const waitsBefore = await lockWaits();

      const move = await whileHeld([taskLock(await taskIdOf(task.key))], async () => {
        const pendingMove = send('patch', `/internal/v1/tasks/${task.key}`, camille, {
          body: { listId: target.id },
        });
        await waitForLockWait(waitsBefore);
        expect((await deleteListRequest(source.id)).status).toBe(204);
        return { pendingMove };
      }).then(async ({ pendingMove }) => pendingMove);

      expectProblem(move, 404, 'task.not-found');
      expect(await storedTask(task.key)).toMatchObject({ list_id: source.id });
      await jobsSettled();
      expect((await storedTask(task.key))?.trash_entry_id).not.toBeNull();
      expect(
        await countOf('select count(*)::int as total from tasks where list_id = $1', [target.id]),
      ).toBe(0);
    });

    it('trashes a task left out of the trash before the cursor of the job of a deleted list, by rescanning the list', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Liste à rescanner' });
      const tasks: TaskBody[] = [];
      for (let number = 1; number <= 51; number += 1) {
        tasks.push(
          await createTask(camille, list.id, { name: `Tâche ${String(number)} à déplacer` }),
        );
      }
      const first = tasks[0];
      const last = tasks.at(-1);
      const waitsBefore = await lockWaits();
      let stranded = '';

      // The first batch takes 50 roots and commits; the second waits for the 51st, which is held.
      // A task lands in the list before the cursor, as a move that raced the deletion would have
      // left it.
      await whileHeld([taskLock(await taskIdOf(last?.key ?? ''))], async () => {
        expect((await deleteListRequest(list.id)).status).toBe(204);
        await waitForLockWait(waitsBefore);
        await vi.waitFor(
          async () => {
            expect(
              await countOf(
                'select count(*)::int as total from tasks where list_id = $1 and trash_entry_id is not null',
                [list.id],
              ),
            ).toBe(50);
          },
          { timeout: 30_000, interval: 100 },
        );
        const client = await migrator.connect();
        try {
          await client.query('begin');
          await client.query(`select set_config('app.system_access', 'on', true)`);
          await client.query(
            `create temp table stranded on commit drop as
               select * from tasks where organization_id = $1 and id = $2`,
            [atelierNordId, await taskIdOf(first?.key ?? '')],
          );
          await client.query(
            `update stranded set id = uuidv7(), key_prefix = 'ZZZ', key_number = 1,
                    created_at = created_at - interval '1 day', trash_entry_id = null`,
          );
          const inserted = await client.query<{ readonly id: string }>(
            'insert into tasks select * from stranded returning id::text as id',
          );
          stranded = inserted.rows[0]?.id ?? '';
          await client.query('commit');
        } finally {
          client.release();
        }
      });
      expect(stranded).not.toBe('');

      await jobsSettled();

      expect(
        await countOf(
          'select count(*)::int as total from tasks where list_id = $1 and trash_entry_id is null',
          [list.id],
        ),
      ).toBe(0);
      expect(
        await countOf(
          'select count(*)::int as total from tasks where id = $1 and trash_entry_id is not null',
          [stranded],
        ),
      ).toBe(1);
    });
  });

  describe('the requests of a tombstone erased before its job ran are still dropped', () => {
    it('drops the pending request of a list whose last entry was erased before its deletion job started', async () => {
      const list = await createList(camille, produit.space.id, {
        name: 'Liste effacée avant son job',
      });
      const task = await createTask(camille, list.id, { name: 'Dernière tâche de la liste' });
      const entry = await trashTask(task.key);
      await jobsSettled();
      const asked = await send('post', '/internal/v1/access-requests', rose, {
        body: { listId: list.id },
      });
      expect(asked.status, asked.text).toBe(202);
      const pending = async (): Promise<number> =>
        countOf(`select count(*)::int as total from access_requests where list_id = $1`, [list.id]);
      expect(await pending()).toBe(1);

      const release = await deleteListHoldingJob(list.id);
      await purgeEntry(entry.id);

      expect((await storedLists([list.id])).size).toBe(0);
      expect(await pending()).toBe(1);
      await release();
      await jobsSettled();
      expect(await pending()).toBe(0);
    });

    it('drops the pending request of a space erased before its deletion job started', async () => {
      const own = await createSpace(camille, {
        name: 'Espace effacé avant son job',
        prefix: 'EFF',
        visibility: 'private',
      });
      const task = await createTask(camille, own.firstList.id, {
        name: 'Dernière tâche de l’espace',
      });
      const entry = await trashTask(task.key);
      await jobsSettled();
      const asked = await send('post', '/internal/v1/access-requests', hugo, {
        body: { spaceId: own.space.id },
      });
      expect(asked.status, asked.text).toBe(202);
      const pending = async (): Promise<number> =>
        countOf(`select count(*)::int as total from access_requests where space_id = $1`, [
          own.space.id,
        ]);
      expect(await pending()).toBe(1);

      const release = await deleteSpaceHoldingJob(own.space.id);
      await purgeEntry(entry.id);

      expect(
        await countOf('select count(*)::int as total from spaces where id = $1', [own.space.id]),
      ).toBe(0);
      expect(await pending()).toBe(1);
      await release();
      await jobsSettled();
      expect(await pending()).toBe(0);
    });
  });

  describe('a restored member that is still archived is announced archived again', () => {
    /**
     * Reads the restored and archived events appended after a known row, as name, key, version and
     * the root of the archive.
     *
     * @param marker - The id of the last row before.
     * @returns The events, in the order of the outbox.
     */
    async function restoredAndArchivedSince(marker: string): Promise<
      {
        readonly name: string;
        readonly key: string;
        readonly version: number;
        readonly rootKey: string;
        readonly actor: unknown;
        readonly occurredAt: string;
      }[]
    > {
      return (await eventsAfter(marker))
        .filter((row) => ['task.restored.v1', 'task.archived.v1'].includes(row.event_name))
        .map((row) => {
          const payload =
            row.event_name === 'task.restored.v1'
              ? conforms(taskEventSchemas['task.restored.v1'], row.payload)
              : conforms(taskEventSchemas['task.archived.v1'], row.payload);
          return {
            name: row.event_name,
            key: payload.key,
            version: payload.version,
            rootKey: payload.rootKey,
            actor: payload.actor,
            occurredAt: payload.occurredAt,
          };
        });
    }

    it('archives each archived member again at the restoration: task.restored.v1 at V then task.archived.v1 at V+1 right after, at the instant of the restoration, by the person who restored it, with the root of its archive', async () => {
      const list = await createList(camille, produit.space.id, { name: 'Reprise d’archives' });
      const root = await createTask(camille, list.id, { name: 'Chantier mixte' });
      const live = await createSubtask(root.key, { name: 'Partie vivante' });
      const part = await createSubtask(root.key, { name: 'Partie archivée' });
      const leaf = await createSubtask(part.key, { name: 'Détail archivé' });
      await archiveTask(part.key, camille);
      const entry = await trashTask(root.key);
      const marker = await lastEventId();

      await restoreEntry(entry.id, hugo);

      const events = await restoredAndArchivedSince(marker);
      expect(events.map((event) => [event.name, event.key])).toEqual([
        ['task.restored.v1', root.key],
        ['task.restored.v1', live.key],
        ['task.restored.v1', part.key],
        ['task.archived.v1', part.key],
        ['task.restored.v1', leaf.key],
        ['task.archived.v1', leaf.key],
      ]);
      const stored = await storedTasks([part.key, leaf.key]);
      for (const key of [part.key, leaf.key]) {
        const restored = events.find(
          (event) => event.name === 'task.restored.v1' && event.key === key,
        );
        const archived = events.find(
          (event) => event.name === 'task.archived.v1' && event.key === key,
        );
        expect(archived, key).toMatchObject({
          version: (restored?.version ?? 0) + 1,
          rootKey: part.key,
          actor: { type: 'user', id: hugo.userId },
        });
        // The archive is the restoration's: its instant and its author.
        expect(instantOf(archived?.occurredAt), key).toBe(instantOf(restored?.occurredAt));
        expect(instantOf(stored.get(key)?.archived_at), key).toBe(instantOf(archived?.occurredAt));
        expect(stored.get(key)?.version, key).toBe(archived?.version);
      }
      const page = await read(
        ListArchivedTasksInternalResponse,
        '/internal/v1/archives/tasks',
        camille,
        { limit: 100 },
      );
      const listed = page.items.find((item) => item.task.key === part.key);
      expect(listed).toMatchObject({ archivedBy: { type: 'user', id: hugo.userId } });
      expect(instantOf(listed?.archivedAt)).toBe(
        instantOf(events.find((event) => event.name === 'task.archived.v1')?.occurredAt),
      );
    });

    it('detaches an archived root restored while its parent is in the trash, keeps its archive and announces both', async () => {
      const origin = await createList(camille, produit.space.id, {
        name: 'Liste d’origine de l’archive',
      });
      const home = await createList(camille, produit.space.id, {
        name: 'Liste d’accueil du parent',
      });
      const parent = await createTask(camille, origin.id, { name: 'Parent déplacé puis supprimé' });
      const child = await archiveTask(
        (await createSubtask(parent.key, { name: 'Sous-tâche archivée du parent' })).key,
      );
      await patchTask(parent.key, { listId: home.id });
      expect((await deleteListRequest(origin.id)).status).toBe(204);
      await jobsSettled();
      const childEntry = (await trashPageOf(camille, { limit: 100 })).items.find(
        (item) => item.task.key === child.key,
      );
      expect(childEntry?.list).toMatchObject({ id: origin.id, state: 'deleted' });
      await trashTask(parent.key);
      const marker = await lastEventId();

      const restored = await restoreEntry(childEntry?.id ?? '');

      expect(restored).toMatchObject({
        task: {
          key: child.key,
          parentKey: null,
          archivedBy: { type: 'user', id: camille.userId },
        },
        detached: true,
        listRestored: true,
      });
      expect(await storedTask(child.key)).toMatchObject({ parent_key: null, trash_entry_id: null });
      const events = await restoredAndArchivedSince(marker);
      expect(events.map((event) => [event.name, event.key])).toEqual([
        ['task.restored.v1', child.key],
        ['task.archived.v1', child.key],
      ]);
      // Archived again at the restoration: one version more, the instant of the restoration.
      expect(restored.task.version).toBe(events[1]?.version);
      expect(events[1]?.version).toBe((events[0]?.version ?? 0) + 1);
      expect(instantOf(restored.task.archivedAt)).toBe(instantOf(events[1]?.occurredAt));
      expect(instantOf(restored.task.archivedAt)).toBe(instantOf(events[0]?.occurredAt));
      expect(instantOf((await storedTask(child.key))?.archived_at)).toBe(
        instantOf(restored.task.archivedAt),
      );
      const restoredEvent = (await eventsAfter(marker)).find(
        (row) => row.event_name === 'task.restored.v1',
      );
      expect(
        conforms(taskEventSchemas['task.restored.v1'], restoredEvent?.payload).parentKey,
      ).toBeNull();
      expect(conforms(taskEventSchemas['task.restored.v1'], restoredEvent?.payload)).toMatchObject({
        archivedAt: restored.task.archivedAt,
        archivedBy: restored.task.archivedBy,
      });
    });
  });

  describe('a restoration that read its list live cannot restore a list deleted meanwhile', () => {
    it('answers 404 trash-entry.not-found and restores nothing when the list is deleted between its read and its locks while its job still has tasks to move, then restores once the job finished', async () => {
      const space = await createSpace(camille, {
        name: 'Course de restauration',
        prefix: 'CRS',
        icon: 'rocket',
        color: 'violet',
      });
      const list = await createList(camille, space.space.id, { name: 'Liste en course' });
      const first = await createTask(camille, list.id, { name: 'Entrée à restaurer' });
      const entry = await trashTask(first.key);
      const pending = await createTask(camille, list.id, { name: 'Tâche restée vivante' });
      const waitsBefore = await lockWaits();

      // The restoration has read its list live and waits for the lock of its space; the deletion
      // of the list commits meanwhile and its job is held, with a task left to move.
      const raced = await whileHeld([spaceShareLock(space.space.id)], async () => {
        const restoration = restoreRequest(entry.id);
        await waitForLockWait(waitsBefore);
        const release = await deleteListHoldingJob(list.id);
        return { restoration, release, marker: await lastEventId() };
      });
      const refused = await raced.restoration;

      expectProblem(refused, 404, 'trash-entry.not-found');
      expect(await eventsAfter(raced.marker)).toEqual([]);
      expect((await storedLists([list.id])).get(list.id)).toMatchObject({
        deleted_by_id: camille.userId,
        restored_at: null,
      });
      expect((await storedLists([list.id])).get(list.id)?.deleted_at).not.toBeNull();
      expect(await storedTask(first.key)).toMatchObject({ trash_entry_id: entry.id });
      expect(await storedTask(pending.key)).toMatchObject({ trash_entry_id: null });

      await raced.release();
      await jobsSettled();
      expect(await restoreEntry(entry.id)).toMatchObject({ listRestored: true });
      expect((await storedTask(pending.key))?.trash_entry_id).not.toBeNull();
    });
  });

  describe('the lists are locked in ascending id by every writer that takes several', () => {
    it('moves a task between two lists while a member holding grants on both is removed, in both orders, without a deadlock', async () => {
      for (const [order, member] of [
        ['removal first', ugo],
        ['move first', vera],
      ] as const) {
        const low = await createList(camille, produit.space.id, { name: `Liste basse, ${order}` });
        const high = await createList(camille, produit.space.id, { name: `Liste haute, ${order}` });
        expect(low.id < high.id).toBe(true);
        await grant(camille, 'lists', low.id, member.userId, 'view');
        await grant(camille, 'lists', high.id, member.userId, 'view');
        const task = await createTask(camille, high.id, { name: `Tâche à descendre, ${order}` });
        const move = (): Promise<request.Response> =>
          send('patch', `/internal/v1/tasks/${task.key}`, camille, { body: { listId: low.id } });
        const remove = (): void => {
          publishMember('removed', atelierNordId, member, 'member', 2);
        };
        const waits = await lockWaits();

        const raced = await whileHeld([listLock(low.id)], async () => {
          let pendingMove: Promise<request.Response>;
          if (order === 'removal first') {
            remove();
            await waitForLockWait(waits);
            pendingMove = move();
          } else {
            pendingMove = move();
            await waitForLockWait(waits);
            remove();
          }
          await waitForLockWait(waits + 1);
          return { pendingMove };
        });

        const moved = await raced.pendingMove;
        expect(moved.status, `${order}: ${moved.text}`).toBe(200);
        await vi.waitFor(
          async () => {
            const jobs = await migrator.query<{ readonly state: string; readonly retries: number }>(
              `select state, retry_count as retries from pgboss.job
                where name = 'task.clean-up-removed-member' and data -> 'payload' ->> 'userId' = $1`,
              [member.userId],
            );
            expect(jobs.rows.map((row) => row.state)).toEqual(['completed']);
            expect(jobs.rows[0]?.retries, 'the clean-up was not retried').toBe(0);
          },
          { timeout: 90_000, interval: 250 },
        );
        expect(await storedTask(task.key)).toMatchObject({ list_id: low.id });
        expect(
          await countOf('select count(*)::int as total from list_grants where user_id = $1', [
            member.userId,
          ]),
        ).toBe(0);
      }
    });

    it('moves a task between two lists of a space while the space is deleted, in both orders, without a deadlock', async () => {
      for (const order of ['deletion first', 'move first'] as const) {
        const own = await createSpace(camille, {
          name: `Espace en mouvement, ${order}`,
          prefix: order === 'deletion first' ? 'MVA' : 'MVB',
          icon: 'rocket',
          color: 'violet',
        });
        const low = own.firstList;
        const high = await createList(camille, own.space.id, { name: `Liste haute, ${order}` });
        expect(low.id < high.id).toBe(true);
        const task = await createTask(camille, high.id, { name: `Tâche en mouvement, ${order}` });
        const move = (): Promise<request.Response> =>
          send('patch', `/internal/v1/tasks/${task.key}`, camille, { body: { listId: low.id } });
        const remove = (): Promise<request.Response> => deleteSpaceRequest(own.space.id);
        const waits = await lockWaits();

        const answers = await whileHeld([listLock(low.id)], async () => {
          const startFirst = order === 'deletion first' ? remove : move;
          const startSecond = order === 'deletion first' ? move : remove;
          const first = startFirst();
          await waitForLockWait(waits);
          const second = startSecond();
          await waitForLockWait(waits + 1);
          return { first, second };
        });
        const [firstAnswer, secondAnswer] = await Promise.all([answers.first, answers.second]);
        const [removed, moved] =
          order === 'deletion first' ? [firstAnswer, secondAnswer] : [secondAnswer, firstAnswer];

        expect(removed.status, `${order}: ${removed.text}`).toBe(204);
        if (order === 'deletion first') {
          // The target list is a tombstone: the move reads it as a list it does not see.
          expect(moved.status, `${order}: ${moved.text}`).toBe(422);
          expect(bodyOf(moved)).toMatchObject({ code: 'task.list-invalid' });
        } else {
          expect(moved.status, `${order}: ${moved.text}`).toBe(200);
        }
        await jobsSettled();
        expect((await storedTask(task.key))?.trash_entry_id, order).not.toBeNull();
      }
    });
  });

  describe('two purge batches lock the deleted lists they erase in one order', () => {
    it('erases entries of the lists of two deleted spaces in crossed orders from two batches at once, without a deadlock', async () => {
      const spaces = [
        await createSpace(camille, { name: 'Espace croisé A', prefix: 'XAA', color: 'violet' }),
        await createSpace(camille, { name: 'Espace croisé B', prefix: 'XBB', color: 'orange' }),
      ];
      const lists = [
        await createList(camille, spaces[0]?.space.id ?? '', { name: 'Liste croisée A' }),
        await createList(camille, spaces[1]?.space.id ?? '', { name: 'Liste croisée B' }),
      ];
      const tasks = {
        a1: await createTask(camille, lists[0]?.id ?? '', { name: 'Croisée A1' }),
        a2: await createTask(camille, lists[0]?.id ?? '', { name: 'Croisée A2' }),
        b1: await createTask(camille, lists[1]?.id ?? '', { name: 'Croisée B1' }),
        b2: await createTask(camille, lists[1]?.id ?? '', { name: 'Croisée B2' }),
      };
      for (const space of spaces) {
        expect((await deleteSpaceRequest(space.space.id)).status).toBe(204);
      }
      await jobsSettled();
      const entries = new Map(
        (await trashPageOf(camille, { limit: 100 })).items.map((item) => [item.task.key, item.id]),
      );
      const entryOf = (key: string): string => entries.get(key) ?? '';
      const mine = [tasks.a1, tasks.a2, tasks.b1, tasks.b2].map((task) => entryOf(task.key));
      // The first batch takes the two entries handed over, list A first; the second finds them
      // locked and takes the two entries due, list B first.
      await asSystem(
        `update trash_entries set purge_requested_at = now() - interval '2 minutes',
                purge_requested_by_type = 'user', purge_requested_by_id = $2
          where id = $1`,
        [entryOf(tasks.a1.key), camille.userId],
      );
      await asSystem(
        `update trash_entries set purge_requested_at = now() - interval '1 minute',
                purge_requested_by_type = 'user', purge_requested_by_id = $2
          where id = $1`,
        [entryOf(tasks.b1.key), camille.userId],
      );
      await asSystem(
        `update trash_entries set trashed_at = trashed_at - interval '40 days' where id = $1`,
        [entryOf(tasks.b2.key)],
      );
      await asSystem(
        `update trash_entries set trashed_at = trashed_at - interval '31 days' where id = $1`,
        [entryOf(tasks.a2.key)],
      );
      const batch = service().get(PurgeTrashBatch, { strict: false });
      const run = (): Promise<unknown> =>
        runWithOrganizationContext(contextOf(atelierNordId), () =>
          batch.execute({ organizationId: atelierNordId }),
        );
      const waits = await lockWaits();

      const running = await whileHeld(
        [listLock(lists[0]?.id ?? ''), listLock(lists[1]?.id ?? '')],
        async () => {
          const first = run();
          await waitForLockWait(waits);
          const second = run();
          await waitForLockWait(waits + 1);
          return { first, second };
        },
      );
      const [one, two] = await Promise.all([running.first, running.second]);

      expect(one).toMatchObject({ outcome: 'purged', entries: 2 });
      expect(two).toMatchObject({ outcome: 'purged', entries: 2 });
      expect(
        await countOf(
          'select count(*)::int as total from trash_entries where id = any($1::uuid[])',
          [mine],
        ),
      ).toBe(0);
      expect((await storedLists(lists.map((list) => list.id))).size).toBe(0);
      expect(
        await countOf('select count(*)::int as total from spaces where id = any($1::uuid[])', [
          spaces.map((space) => space.space.id),
        ]),
      ).toBe(0);
    });
  });

  describe('the requests of the lists of a deleted space are dropped by its job', () => {
    it('drops the pending request of a list whose last entry was erased before the job of its space ran', async () => {
      const own = await createSpace(camille, {
        name: 'Espace aux demandes',
        prefix: 'DCN',
        icon: 'rocket',
        color: 'violet',
      });
      const list = await createList(camille, own.space.id, { name: 'Liste demandée' });
      const task = await createTask(camille, list.id, { name: 'Tâche de la liste demandée' });
      const entry = await trashTask(task.key);
      await jobsSettled();
      const asked = await send('post', '/internal/v1/access-requests', nadia, {
        body: { listId: list.id },
      });
      expect(asked.status, asked.text).toBe(202);
      const pending = async (): Promise<number> =>
        countOf(`select count(*)::int as total from access_requests where list_id = $1`, [list.id]);
      expect(await pending()).toBe(1);

      const release = await deleteSpaceHoldingJob(own.space.id);
      await purgeEntry(entry.id);

      expect((await storedLists([list.id])).size).toBe(0);
      expect(await pending()).toBe(1);
      await release();
      await jobsSettled();
      expect(await pending()).toBe(0);
    });
  });

  describe('a revocation committed while a write waited for its locks refuses the write', () => {
    /**
     * Holds rows locked by a transaction of the migrator role and changes them as the revocation
     * of an access does, starts a call, waits until it waits for a lock, then commits: the call
     * meets the revocation committed.
     *
     * @param statements - The locks and the changes, run in order with the system access.
     * @param call - The write that queues behind them.
     * @returns The answer of the call.
     */
    async function revokedWhileQueued<TResult>(
      statements: readonly (readonly [string, readonly unknown[]])[],
      call: () => Promise<TResult>,
    ): Promise<TResult> {
      const holder = await migrator.connect();
      try {
        await holder.query('begin');
        await holder.query(`select set_config('app.system_access', 'on', true)`);
        for (const [statement, params] of statements) {
          await holder.query(statement, [...params]);
        }
        const waits = await lockWaits();
        const pending = call();
        await waitForLockWait(waits);
        await holder.query('commit');
        return await pending;
      } catch (error) {
        await holder.query('rollback');
        throw error;
      } finally {
        holder.release();
      }
    }

    /**
     * The change that makes a space private, as a change of its visibility writes it: the
     * visibility and the next version.
     *
     * @param spaceId - The space.
     * @returns The statement and its parameters.
     */
    function madePrivate(spaceId: string): readonly [string, readonly unknown[]] {
      return [
        `update spaces set visibility = 'private', version = version + 1
          where organization_id = $1 and id = $2`,
        [atelierNordId, spaceId],
      ];
    }

    /**
     * The revocation of the grant of a person on a space: the grant removed and the next version of
     * the space.
     *
     * @param spaceId - The space.
     * @param userId - The person.
     * @returns The statements and their parameters.
     */
    function spaceGrantRevoked(
      spaceId: string,
      userId: string,
    ): readonly (readonly [string, readonly unknown[]])[] {
      return [
        [
          'delete from space_grants where organization_id = $1 and space_id = $2 and user_id = $3',
          [atelierNordId, spaceId, userId],
        ],
        [
          'update spaces set version = version + 1 where organization_id = $1 and id = $2',
          [atelierNordId, spaceId],
        ],
      ];
    }

    /**
     * The revocation of the grant of a person on a list, or its change to another role: the grant
     * removed or changed, and the next version of the list.
     *
     * @param listId - The list.
     * @param userId - The person.
     * @param role - The role left, `null` to remove the grant.
     * @returns The statements and their parameters.
     */
    function listGrantChanged(
      listId: string,
      userId: string,
      role: Role | null,
    ): readonly (readonly [string, readonly unknown[]])[] {
      return [
        role === null
          ? [
              'delete from list_grants where organization_id = $1 and list_id = $2 and user_id = $3',
              [atelierNordId, listId, userId],
            ]
          : [
              'update list_grants set role = $4 where organization_id = $1 and list_id = $2 and user_id = $3',
              [atelierNordId, listId, userId, role],
            ],
        [
          'update lists set version = version + 1 where organization_id = $1 and id = $2',
          [atelierNordId, listId],
        ],
      ];
    }

    /**
     * The statement that holds a trash entry `FOR UPDATE`.
     *
     * @param entryId - The entry.
     * @returns The statement and its parameters.
     */
    function entryLock(entryId: string): readonly [string, readonly unknown[]] {
      return [
        'select 1 from trash_entries where organization_id = $1 and id = $2 for update',
        [atelierNordId, entryId],
      ];
    }

    it('refuses the deletion of a list with 404 list.not-found when its space was made private, or the space grant of the actor revoked, while the deletion waited, though the list itself did not change, and deletes nothing', async () => {
      const open = await createSpace(camille, {
        name: 'Espace bientôt privé',
        prefix: 'RVA',
        icon: 'rocket',
        color: 'violet',
      });
      const shared = await createSpace(camille, {
        name: 'Espace partagé à Léa',
        prefix: 'RVB',
        visibility: 'private',
      });
      await grant(camille, 'spaces', shared.space.id, lea.userId, 'edit');
      const cases: readonly {
        readonly label: string;
        readonly spaceId: string;
        readonly listId: string;
        readonly revocation: readonly (readonly [string, readonly unknown[]])[];
      }[] = [
        {
          label: 'space made private',
          spaceId: open.space.id,
          listId: open.firstList.id,
          revocation: [madePrivate(open.space.id)],
        },
        {
          label: 'space grant revoked',
          spaceId: shared.space.id,
          listId: shared.firstList.id,
          revocation: spaceGrantRevoked(shared.space.id, lea.userId),
        },
      ];

      for (const { label, spaceId, listId, revocation } of cases) {
        // Léa edits the list through the space alone, as the unlocked check reads it.
        expect((await readList(listId, lea)).callerRole, label).toBe('edit');
        const before = (await storedLists([listId])).get(listId);
        const [space, list] = [spaceLock(spaceId), listLock(listId)];

        const refused = await revokedWhileQueued([space, list, ...revocation], () =>
          deleteListRequest(listId, lea),
        );

        expectProblem(refused, 404, 'list.not-found');
        expect((await storedLists([listId])).get(listId), label).toMatchObject({
          version: before?.version,
          deleted_at: null,
        });
        expect(await eventsOf('list.deleted.v1', 'listId', listId), label).toEqual([]);
      }
    });

    it('refuses the deletion of a list with 404 list.not-found when the list grant of a guest was revoked while the deletion waited, and with 403 access.role-insufficient when it was lowered to view', async () => {
      const own = await createSpace(camille, {
        name: 'Espace des invitées',
        prefix: 'RVC',
        icon: 'rocket',
        color: 'violet',
      });
      const revoked = await createList(camille, own.space.id, { name: 'Liste retirée à Nadia' });
      const lowered = await createList(camille, own.space.id, { name: 'Liste réduite pour Rose' });
      await grant(camille, 'lists', revoked.id, nadia.userId, 'edit');
      await grant(camille, 'lists', lowered.id, rose.userId, 'edit');

      const notFound = await revokedWhileQueued(
        [listLock(revoked.id), ...listGrantChanged(revoked.id, nadia.userId, null)],
        () => deleteListRequest(revoked.id, nadia),
      );
      const insufficient = await revokedWhileQueued(
        [listLock(lowered.id), ...listGrantChanged(lowered.id, rose.userId, 'view')],
        () => deleteListRequest(lowered.id, rose),
      );

      expectProblem(notFound, 404, 'list.not-found');
      expectProblem(insufficient, 403, 'access.role-insufficient');
      const stored = await storedLists([revoked.id, lowered.id]);
      expect(stored.get(revoked.id)?.deleted_at).toBeNull();
      expect(stored.get(lowered.id)?.deleted_at).toBeNull();
      expect(await eventsOf('list.deleted.v1', 'listId', revoked.id)).toEqual([]);
      expect(await eventsOf('list.deleted.v1', 'listId', lowered.id)).toEqual([]);
    });

    it('refuses "Supprimer définitivement" with 404 trash-entry.not-found when the space of the entry was made private, or the list grant of a guest revoked, while the erasure waited for the entry, and erases nothing', async () => {
      const open = await createSpace(camille, {
        name: 'Corbeille bientôt privée',
        prefix: 'RVD',
        icon: 'rocket',
        color: 'violet',
      });
      const guestList = await createList(camille, produit.space.id, {
        name: 'Corbeille de Nadia',
      });
      await grant(camille, 'lists', guestList.id, nadia.userId, 'edit');
      const ofSpace = await createTask(camille, open.firstList.id, { name: 'Entrée de l’espace' });
      const ofGrant = await createTask(camille, guestList.id, { name: 'Entrée de l’invitée' });
      const spaceEntry = await trashTask(ofSpace.key);
      const grantEntry = await trashTask(ofGrant.key);
      const cases: readonly {
        readonly label: string;
        readonly actor: Person;
        readonly key: string;
        readonly entryId: string;
        readonly revocation: readonly (readonly [string, readonly unknown[]])[];
      }[] = [
        {
          label: 'space made private',
          actor: lea,
          key: ofSpace.key,
          entryId: spaceEntry.id,
          revocation: [madePrivate(open.space.id)],
        },
        {
          label: 'list grant revoked',
          actor: nadia,
          key: ofGrant.key,
          entryId: grantEntry.id,
          revocation: listGrantChanged(guestList.id, nadia.userId, null),
        },
      ];

      for (const { label, actor, key, entryId, revocation } of cases) {
        expect(
          (await trashPageOf(actor)).items.map((item) => item.id),
          label,
        ).toContain(entryId);

        const refused = await revokedWhileQueued([entryLock(entryId), ...revocation], () =>
          purgeRequest(entryId, actor),
        );

        expectProblem(refused, 404, 'trash-entry.not-found');
        expect(
          await countOf('select count(*)::int as total from trash_entries where id = $1', [
            entryId,
          ]),
          label,
        ).toBe(1);
        expect(await storedTask(key), label).toMatchObject({ trash_entry_id: entryId });
        expect(await purgedOf(entryId), label).toEqual([]);
        expect(
          (await trashPageOf(actor)).items.map((item) => item.id),
          label,
        ).not.toContain(entryId);
      }
      // Camille, who keeps her access, still erases them.
      await purgeEntry(spaceEntry.id);
      await purgeEntry(grantEntry.id);
    });

    it('hands nothing of a list whose grant was revoked while "Vider la corbeille" waited for its entries, and still hands over the entries of a list the guest keeps', async () => {
      const revoked = await createList(camille, produit.space.id, { name: 'Vidage retiré' });
      const kept = await createList(camille, produit.space.id, { name: 'Vidage gardé' });
      await grant(camille, 'lists', revoked.id, nadia.userId, 'edit');
      await grant(camille, 'lists', kept.id, nadia.userId, 'edit');
      const revokedTasks = [
        await createTask(camille, revoked.id, { name: 'Retirée 1' }),
        await createTask(camille, revoked.id, { name: 'Retirée 2' }),
      ];
      const revokedEntries = [
        await trashTask(revokedTasks[0]?.key ?? ''),
        await trashTask(revokedTasks[1]?.key ?? ''),
      ];
      const keptEntry = await trashTask(
        (await createTask(camille, kept.id, { name: 'Gardée' })).key,
      );
      const before = await trashPageOf(nadia, { limit: 100 });
      const listed = before.items.map((item) => item.id);
      expect(listed).toEqual(
        expect.arrayContaining([...revokedEntries.map((entry) => entry.id), keptEntry.id]),
      );
      const held = revokedEntries[1]?.id ?? '';

      const emptied = await revokedWhileQueued(
        [entryLock(held), ...listGrantChanged(revoked.id, nadia.userId, null)],
        () => emptyRequest(nadia),
      );

      expect(emptied.status, emptied.text).toBe(202);
      expect(conforms(EmptyTrashInternalResponse, bodyOf(emptied))).toEqual({
        entryCount: before.total - revokedEntries.length,
      });
      const requested = await asSystem<{ readonly id: string; readonly requested: boolean }>(
        `select id::text as id, purge_requested_at is not null as requested from trash_entries
          where id = any($1::uuid[]) order by id`,
        [revokedEntries.map((entry) => entry.id)],
      );
      expect(requested.map((row) => row.requested)).toEqual([false, false]);
      const camillePage = (await trashPageOf(camille, { limit: 100 })).items.map((item) => item.id);
      expect(camillePage).toEqual(expect.arrayContaining(revokedEntries.map((entry) => entry.id)));
      expect(camillePage).not.toContain(keptEntry.id);
      await jobsSettled();
      expect(
        await countOf('select count(*)::int as total from trash_entries where id = $1', [
          keptEntry.id,
        ]),
      ).toBe(0);
      expect((await purgedOf(keptEntry.id))[0]?.actor).toEqual({
        type: 'user',
        id: nadia.userId,
      });
      // The editor who keeps the list restores what the revoked guest could not hand over.
      expect((await restoreEntry(revokedEntries[0]?.id ?? '')).task.key).toBe(revokedTasks[0]?.key);
    });
  });

  describe('the erasure of the last entry of a list serializes with the deletion of the list on its space', () => {
    it('erases the tombstone of a list, and of its deleted space, whose last entry is erased while the list or its space is deleted, in both orders', async () => {
      const races = [
        ['list', 'erasure first'],
        ['list', 'deletion first'],
        ['space', 'erasure first'],
        ['space', 'deletion first'],
      ] as const;
      for (const [index, [target, order]] of races.entries()) {
        const own = await createSpace(camille, {
          name: `Dernière entrée ${String(index + 1)}`,
          prefix: `DE${['A', 'B', 'C', 'D'][index] ?? 'Z'}`,
          icon: 'rocket',
          color: 'violet',
        });
        const list = own.firstList;
        const task = await createTask(camille, list.id, {
          name: `Dernière tâche, ${target}, ${order}`,
        });
        const entry = await trashTask(task.key);
        const erase = (): Promise<request.Response> => purgeRequest(entry.id);
        const remove = (): Promise<request.Response> =>
          target === 'list' ? deleteListRequest(list.id) : deleteSpaceRequest(own.space.id);
        const label = `${target}, ${order}`;

        const [erased, removed] =
          order === 'erasure first'
            ? await behindSpace(own.space.id, erase, remove)
            : await behindSpace(own.space.id, remove, erase).then(
                ([first, second]): [request.Response, request.Response] => [second, first],
              );

        expect(erased.status, `${label}: ${erased.text}`).toBe(204);
        expect(removed.status, `${label}: ${removed.text}`).toBe(204);
        await jobsSettled();
        expect((await storedLists([list.id])).size, label).toBe(0);
        expect(
          await countOf('select count(*)::int as total from spaces where id = $1', [own.space.id]),
          label,
        ).toBe(target === 'space' ? 0 : 1);
        expect(await purgedOf(entry.id), label).toHaveLength(1);
      }
    });

    it('makes the deletion of a list wait for an erasure of its last entry that has not committed yet, and erases the tombstone once both committed', async () => {
      const own = await createSpace(camille, {
        name: 'Effacement ouvert',
        prefix: 'EFO',
        icon: 'rocket',
        color: 'violet',
      });
      const list = await createList(camille, own.space.id, { name: 'Liste à la dernière entrée' });
      const task = await createTask(camille, list.id, { name: 'Dernière entrée ouverte' });
      const entry = await trashTask(task.key);
      const purge = service().get(PurgeTrashEntry, { strict: false });
      let commit: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        commit = resolve;
      });
      let returned: () => void = () => undefined;
      const executed = new Promise<void>((resolve) => {
        returned = resolve;
      });

      // The erasure runs in a tenant transaction the test leaves open after the use case returned.
      const erasure = inTenant(atelierNordId, async () => {
        await purge.execute({
          organizationId: atelierNordId,
          actorUserId: camille.userId,
          entryId: entry.id,
        });
        returned();
        await gate;
      });
      await Promise.race([executed, erasure]);
      // Not committed: every other transaction still reads the task in its entry.
      expect(await storedTask(task.key)).toMatchObject({ trash_entry_id: entry.id });
      const waits = await lockWaits();
      const deletion = deleteListRequest(list.id);
      await waitForLockWait(waits);
      expect((await storedLists([list.id])).get(list.id)?.deleted_at).toBeNull();
      commit();
      await erasure;
      const removed = await deletion;

      expect(removed.status, removed.text).toBe(204);
      expect(await storedTask(task.key)).toBeUndefined();
      expect(await purgedOf(entry.id)).toHaveLength(1);
      await jobsSettled();
      expect((await storedLists([list.id])).size).toBe(0);
    });
  });

  describe('the erasure of an empty deleted list and the clean-up of a member who left lock the space before the list', () => {
    it('erases an empty deleted list and its deleted space while a member who held a grant on the list is removed, in both orders, without a deadlock', async () => {
      const races = [
        ['clean-up first', margaux],
        ['erasure first', bastien],
      ] as const;
      for (const [index, [order, member]] of races.entries()) {
        publishMember('joined', atelierNordId, member, 'member', 1);
        await vi.waitFor(
          async () => {
            expect(await activeMembers(atelierNordId)).toContain(member.userId);
          },
          { timeout: 60_000, interval: 250 },
        );
        const own = await createSpace(camille, {
          name: `Espace vide, ${order}`,
          prefix: index === 0 ? 'EVA' : 'EVB',
          icon: 'rocket',
          color: 'violet',
        });
        await grant(camille, 'lists', own.firstList.id, member.userId, 'view');
        const release = await deleteSpaceHoldingJob(own.space.id);
        const deletionBatch = service().get(TrashDeletedListTasks, { strict: false });
        const erase = (): Promise<unknown> =>
          runWithOrganizationContext(contextOf(atelierNordId), () =>
            deletionBatch.execute({
              organizationId: atelierNordId,
              listId: own.firstList.id,
              after: null,
            }),
          );
        const remove = (): void => {
          publishMember('removed', atelierNordId, member, 'member', 2);
        };
        const waits = await lockWaits();

        const raced = await whileHeld([spaceLock(own.space.id)], async () => {
          let erasure: Promise<unknown>;
          if (order === 'clean-up first') {
            remove();
            await waitForLockWait(waits);
            erasure = erase();
          } else {
            erasure = erase();
            await waitForLockWait(waits);
            remove();
          }
          await waitForLockWait(waits + 1);
          return { erasure };
        });

        expect(await raced.erasure, order).toEqual({
          outcome: 'none-left',
          listPurged: true,
          spacePurged: true,
        });
        // The clean-up completes at its first attempt: a grant it read before its locks, whose list
        // and space the erasure erased meanwhile, is gone, not a failure of the batch.
        await vi.waitFor(
          async () => {
            const jobs = await migrator.query<{ readonly state: string; readonly retries: number }>(
              `select state, retry_count as retries from pgboss.job
                where name = 'task.clean-up-removed-member' and data -> 'payload' ->> 'userId' = $1`,
              [member.userId],
            );
            expect(
              jobs.rows.map((row) => row.state),
              order,
            ).toEqual(['completed']);
            expect(jobs.rows[0]?.retries, `${order}: the clean-up was not retried`).toBe(0);
          },
          { timeout: 90_000, interval: 250 },
        );
        expect(
          await countOf('select count(*)::int as total from list_grants where user_id = $1', [
            member.userId,
          ]),
          order,
        ).toBe(0);
        expect((await storedLists([own.firstList.id])).size, order).toBe(0);
        expect(
          await countOf('select count(*)::int as total from spaces where id = $1', [own.space.id]),
          order,
        ).toBe(0);
        await release();
        await jobsSettled();
      }
    });
  });

  describe('a deletion of a task and the job of its deleted list lock its tree in one order', () => {
    it('trashes a parent created after its subtask while the job of its deleted list waits for the same tree, without a deadlock: a deletion that read the list live and queued first moves the tree, and one started after the list was deleted answers 404 task.not-found at once', async () => {
      for (const order of ['task deletion first', 'job first'] as const) {
        const list = await createList(camille, produit.space.id, {
          name: `Arbre inversé, ${order}`,
        });
        // The subtask is created first, so its id is the smaller one of the tree.
        const child = await createTask(camille, list.id, {
          name: `Sous-tâche plus ancienne, ${order}`,
        });
        const parent = await createTask(camille, list.id, {
          name: `Parent plus récent, ${order}`,
        });
        await patchTask(child.key, { parentKey: parent.key });
        const [childId, parentId] = [await taskIdOf(child.key), await taskIdOf(parent.key)];
        expect(childId < parentId).toBe(true);
        const deletionBatch = service().get(TrashDeletedListTasks, { strict: false });
        const runJob = (): Promise<unknown> =>
          runWithOrganizationContext(contextOf(atelierNordId), () =>
            deletionBatch.execute({ organizationId: atelierNordId, listId: list.id, after: null }),
          );
        const waits = await lockWaits();

        // The parent is held: whoever comes first takes the subtask, the smaller id, and waits for
        // the parent; the other waits for the subtask.
        const raced = await whileHeld([taskLock(parentId)], async () => {
          if (order === 'task deletion first') {
            const trashing = trashRequest(parent.key);
            await waitForLockWait(waits);
            const release = await deleteListHoldingJob(list.id);
            const job = runJob();
            await waitForLockWait(waits + 1);
            return { trashing, job, release };
          }
          const release = await deleteListHoldingJob(list.id);
          const job = runJob();
          await waitForLockWait(waits);
          // Answered while the parent is still held: the list reads deleted before any lock.
          const early = await trashRequest(parent.key);
          return { trashing: Promise.resolve(early), job, release };
        });
        const [trashed, moved] = await Promise.all([raced.trashing, raced.job]);

        const stored = await storedTasks([child.key, parent.key]);
        const entryId = stored.get(parent.key)?.trash_entry_id ?? null;
        expect(entryId, order).not.toBeNull();
        expect(stored.get(child.key)?.trash_entry_id, order).toBe(entryId);
        if (order === 'task deletion first') {
          expect(entryAnswer(trashed)).toMatchObject({ id: entryId, subtaskCount: 1 });
          expect(moved, order).toMatchObject({ outcome: 'trashed', entries: 0 });
        } else {
          expectProblem(trashed, 404, 'task.not-found');
          expect(moved, order).toMatchObject({ outcome: 'trashed', entries: 1 });
        }
        expect(
          (await trashedOf(entryId ?? '')).map((event) => event.key),
          order,
        ).toEqual([parent.key, child.key]);
        await raced.release();
        await jobsSettled();
      }
    });
  });

  describe('no job of the trash ended in a dead letter', () => {
    it('leaves no failed job in the four queues, and no dead letter', async () => {
      const result = await migrator.query<{ readonly name: string; readonly state: string }>(
        `select name, state from pgboss.job
          where (name = any($1::text[]) and state = 'failed') or name like '%.dead-letter'`,
        [deletionQueues],
      );

      expect(result.rows).toEqual([]);
    });
  });
});
