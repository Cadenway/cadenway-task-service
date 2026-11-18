import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { eventSchemas as taskEventSchemas } from '@cadenway/contracts/events/task-service';
import type {
  MemberJoinedV1,
  MemberRemovedV1,
  MemberRoleChangedV1,
} from '@cadenway/contracts/events/organization-service';
import {
  AddChecklistItemInternalResponse,
  AddTaskLabelInternalResponse,
  AssignTaskInternalResponse,
  CreateListInternalResponse,
  CreateSpaceInternalResponse,
  CreateSubtaskInternalResponse,
  CreateTaskInternalResponse,
  GetTaskDetailInternalResponse,
  GetTaskInternalResponse,
  ListListActivityInternalResponse,
  ListSubtasksInternalResponse,
  ListTaskActivityInternalResponse,
  RemoveTaskLabelInternalResponse,
  UpdateChecklistItemInternalResponse,
  UpdateSpaceInternalResponse,
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
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';

// The tasks of the organizations, on a disposable PostgreSQL and NATS: the service as main.ts
// assembles it (the `task_app` role, the `task` NATS user), started from compose.dev.yaml as a
// throwaway Compose project on free ports, as spaces.int-spec.ts does. The members come from the
// copy of the memberships, fed the way organization-service feeds it: member events published to
// `EVENTS` with the `admin` user of the `nats-streams` container, which also delivers the removals
// the tasks must follow. The routes are called with internal tokens signed as the API gateway and
// their answers are checked against the validators generated from
// `openapi/internal/task-service.yaml`; the outbox rows are checked against the schemas of
// `asyncapi/task-service.yaml`. Rows are read, aged and seeded as the migrator role, which sets the
// system access of the policies, since row-level security is forced on every table.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-tasks-test-${String(process.pid)}`;

/** How long the copy, the relay or the broker may take to follow a change. */
const waitOptions = { timeout: 15_000, interval: 200 } as const;

/** The handler of a delivery gives up after this long (25 s in the kit), under the 30 s ack wait. */
const handlerBudgetMs = 25_000;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** A second organization, with its own owner, which must never meet a row of Atelier Nord. */
const atelierDeltaId = '01938f6e-0000-7000-8000-000000000002';

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

/** Hugo Dubois (HD), member of Atelier Nord. */
const hugo: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c26',
  memberId: '01938f6e-9000-7000-8000-0000000000c3',
};

/** Léa Petit (LP), member of Atelier Nord. */
const lea: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c27',
  memberId: '01938f6e-9000-7000-8000-0000000000c4',
};

/** Nadia Benali, guest of Atelier Nord. */
const nadia: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c28',
  memberId: '01938f6e-9000-7000-8000-0000000000c6',
};

/** Solène Garnier, owner of the second organization. */
const solene: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c29',
  memberId: '01938f6e-9000-7000-8000-0000000000c7',
};

/** Mathis Roux, member of Atelier Nord, whose removal is the plain case. */
const mathis: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2a',
  memberId: '01938f6e-9000-7000-8000-0000000000c8',
};

/** Chloé Girard, member of Atelier Nord, who joins again under another membership. */
const chloe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2d',
  memberId: '01938f6e-9000-7000-8000-0000000000cc',
};

/** Noé Perrin, member of Atelier Nord, whose removal is held back by a lock. */
const noe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2e',
  memberId: '01938f6e-9000-7000-8000-0000000000cd',
};

/** Théo Garnier, member of Atelier Nord, assigned to a thousand tasks. */
const theo: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2f',
  memberId: '01938f6e-9000-7000-8000-0000000000ce',
};

/** The new membership Chloé Girard gets when she joins Atelier Nord again. */
const chloeNewMemberId = '01938f6e-9000-7000-8000-0000000000d1';

/** Twenty-one more members of Atelier Nord, to fill the twenty places of a task and one more. */
const crowd: readonly Person[] = Array.from({ length: 21 }, (_, index): Person => {
  const suffix = index.toString(16).padStart(4, '0');
  return {
    userId: `01938f6e-8a42-7d5b-b2c9-5e1f3a6e${suffix}`,
    memberId: `01938f6e-9000-7000-8000-00000001${suffix}`,
  };
});

/** Which member event. */
type MemberEventKind = 'joined' | 'role-changed' | 'removed';

/** A member event after its publication. */
interface PublishedEvent {
  readonly id: string;
  readonly kind: MemberEventKind;
  readonly body: string;
}

/** What the durable consumer reports to the `admin` user (`nats consumer info --json`). */
interface ConsumerInfo {
  readonly delivered: { readonly consumer_seq: number };
  readonly ack_floor: { readonly consumer_seq: number };
  readonly num_ack_pending: number;
  readonly num_redelivered: number;
  readonly num_pending: number;
}

/** A row of `outbox_events`, as the specs read it. */
interface OutboxRow {
  readonly event_name: string;
  readonly status: string;
  readonly payload: unknown;
}

/** A task, as the routes answer it. */
type TaskBody = z.output<typeof GetTaskInternalResponse>;

/** The detail of a task, as the route answers it. */
type TaskDetailBody = z.output<typeof GetTaskDetailInternalResponse>;

/** A page of activity, as the routes answer it. */
type ActivityBody = z.output<typeof ListTaskActivityInternalResponse>;

/** A space, as the routes answer it. */
type SpaceBody = z.output<typeof UpdateSpaceInternalResponse>;

/** A list or a sprint, as the routes answer it. */
type ListBody = z.output<typeof CreateListInternalResponse>;

/** HTTP verbs the spec uses. */
type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** What a call adds to its path. */
interface SendOptions {
  readonly organizationId?: string;
  readonly body?: object;
  readonly headers?: Readonly<Record<string, string>>;
}

/** The tables of the tasks the specs count rows in. */
type CountedTable =
  | 'spaces'
  | 'space_prefixes'
  | 'tasks'
  | 'task_assignees'
  | 'task_labels'
  | 'checklist_items'
  | 'activity_entries';

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
 * Reads a durable consumer of `EVENTS` as the `admin` user.
 *
 * @param handler - The handler of the consumer, after `task-service__`.
 * @returns What the broker reports.
 */
function consumerInfo(handler: string): ConsumerInfo {
  return JSON.parse(
    compose(
      'exec',
      '-T',
      'nats-streams',
      'nats',
      'consumer',
      'info',
      'EVENTS',
      `task-service__${handler}`,
      '--json',
    ),
  ) as ConsumerInfo;
}

/**
 * Builds a member event as organization-service emits it, with a new event id.
 *
 * @param kind - Which event.
 * @param organizationId - Organization of the membership.
 * @param person - The membership and its account.
 * @param role - Role of the membership.
 * @param version - Version of the membership after the event.
 * @param previousRole - For a role change, the role before it.
 * @returns Its id and its JSON body.
 */
function toPublishedEvent(
  kind: MemberEventKind,
  organizationId: string,
  person: Person,
  role: MemberJoinedV1['role'],
  version: number,
  previousRole: MemberJoinedV1['role'] = 'member',
): PublishedEvent {
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
  let payload: MemberJoinedV1 | MemberRoleChangedV1 | MemberRemovedV1;
  switch (kind) {
    case 'joined':
      payload = { ...common, actor: { type: 'user', id: person.userId }, invitationId: null };
      break;
    case 'role-changed':
      payload = { ...common, actor: { type: 'user', id: camille.userId }, previousRole };
      break;
    case 'removed':
      payload = { ...common, actor: { type: 'user', id: camille.userId } };
      break;
  }
  return { id, kind, body: JSON.stringify(payload) };
}

/**
 * Publishes a member event on its `evt.` subject with the `admin` user, waiting for the
 * acknowledgement of the stream.
 *
 * @param published - The event.
 */
function publish(published: PublishedEvent): void {
  compose(
    'exec',
    '-T',
    'nats-streams',
    'nats',
    'pub',
    '--jetstream',
    '--header',
    `Nats-Msg-Id:${published.id}`,
    `evt.member.${published.kind}.v1`,
    published.body,
  );
}

/**
 * Publishes a member event and waits until its consumer has delivered it and acknowledged
 * everything it delivered, so that the copy holds the outcome of the event.
 *
 * @param published - The event.
 */
async function deliver(published: PublishedEvent): Promise<void> {
  const handler = `project-member-${published.kind}`;
  const before = consumerInfo(handler).delivered.consumer_seq;
  publish(published);
  await vi.waitFor(() => {
    const info = consumerInfo(handler);
    expect(info.delivered.consumer_seq).toBeGreaterThan(before);
    expect(info.ack_floor.consumer_seq).toBe(info.delivered.consumer_seq);
    expect(info.num_ack_pending).toBe(0);
    expect(info.num_pending).toBe(0);
  }, waitOptions);
}

/**
 * Creates the Ed25519 key pair of the gateway in the JWK forms the internal token uses.
 *
 * @returns The public key for the verifier and the private key for the signer.
 */
function keyPair(): {
  readonly publicJwk: Ed25519PublicJwk;
  readonly privateJwk: Ed25519PrivateJwk;
} {
  const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  if (x === undefined || d === undefined) {
    throw new Error('Node returned an Ed25519 JWK without its key material.');
  }
  const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'test-api-gateway' };
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
    actor: { type: 'user', id: camille.userId },
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
 * The `details` of a problem, empty when it has none.
 *
 * @param response - A supertest response holding a problem.
 * @returns Its details.
 */
function detailsOf(response: request.Response): Readonly<Record<string, unknown>> {
  const problem = bodyOf(response) as { readonly details?: Readonly<Record<string, unknown>> };
  return problem.details ?? {};
}

/**
 * Checks the status of a response, and shows the body when it is another one.
 *
 * @param response - A supertest response.
 * @param status - Expected HTTP status.
 */
function expectStatus(response: request.Response, status: number): void {
  if (response.status !== status) {
    throw new Error(
      `Expected ${String(status)}, got ${String(response.status)}: ${JSON.stringify(response.body)}`,
    );
  }
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
  expectStatus(response, status);
  expect(response.headers['content-type']).toMatch(/^application\/problem\+json/u);
  expect(bodyOf(response)).toMatchObject({
    status,
    code,
    ...(details === undefined ? {} : { details }),
  });
}

/**
 * The number of a task key (`CAD-482` gives 482).
 *
 * @param key - The key.
 * @returns Its number.
 */
function numberOf(key: string): number {
  return Number(key.split('-')[1]);
}

/**
 * The key of the task whose number is a few after the one of another task of the same prefix.
 *
 * @param key - The key of the task.
 * @param offset - How many numbers after it.
 * @returns The key.
 */
function numberedKey(key: string, offset: number): string {
  return `${key.split('-')[0] ?? ''}-${String(numberOf(key) + offset)}`;
}

/**
 * Pauses the test.
 *
 * @param milliseconds - How long.
 * @returns A promise that resolves after the pause.
 */
async function pause(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe('tasks', () => {
  const gateway = keyPair();
  let app: NestExpressApplication | undefined;
  let signer: InternalTokenSigner;
  let migrator: pg.Pool;

  // The spaces and lists of Atelier Nord the scenarios work in.
  let produit: SpaceBody;
  let produitList: ListBody;
  let sprint14: ListBody;
  let marketing: SpaceBody;
  let marketingList: ListBody;
  let recherche: SpaceBody;
  let rechercheList: ListBody;
  let directionList: ListBody;

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
   * Calls a route of the service as the API gateway does, acting for a member.
   *
   * @param method - HTTP verb.
   * @param path - Path of the route, with its query.
   * @param actor - The account the gateway acts for.
   * @param options - Organization (Atelier Nord by default), body and headers.
   * @returns The response.
   */
  async function send(
    method: HttpMethod,
    path: string,
    actor: { readonly userId: string },
    options: SendOptions = {},
  ): Promise<request.Response> {
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
    if (options.body !== undefined) {
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
   * Counts the rows of a table of Atelier Nord that match a condition.
   *
   * @param table - The table.
   * @param condition - SQL condition on the columns of the table.
   * @param params - Parameters of the condition, from `$2`.
   * @returns The number of rows.
   */
  async function countRows(
    table: CountedTable,
    condition: string,
    ...params: readonly unknown[]
  ): Promise<number> {
    const rows = await asSystem<{ readonly total: number }>(
      `select count(*)::int as total from ${table} where organization_id = $1 and ${condition}`,
      [atelierNordId, ...params],
    );
    return rows[0]?.total ?? 0;
  }

  /**
   * Reads the outbox rows of tasks by key, oldest first (ids come from `uuidv7()`).
   *
   * @param keys - The keys of the tasks.
   * @returns The rows of the `task.*` events.
   */
  async function outboxOfKeys(...keys: readonly string[]): Promise<OutboxRow[]> {
    return asSystem<OutboxRow>(
      `select event_name, status, payload from outbox_events
        where event_name like 'task.%' and payload ->> 'key' = any($1::text[]) order by id`,
      [keys],
    );
  }

  /**
   * Counts every outbox row of the task events of Atelier Nord.
   *
   * @returns The number of rows.
   */
  async function countTaskEvents(): Promise<number> {
    const rows = await asSystem<{ readonly total: number }>(
      `select count(*)::int as total from outbox_events
        where organization_id = $1 and event_name like 'task.%'`,
      [atelierNordId],
    );
    return rows[0]?.total ?? 0;
  }

  /**
   * Makes the entries of a kind of a task older, to cross the window of the coalescing.
   *
   * @param key - Key of the task.
   * @param kind - Kind of the entries.
   * @param seconds - How much older.
   */
  async function ageActivity(key: string, kind: string, seconds: number): Promise<void> {
    const [prefix, number] = key.split('-');
    await asSystem(
      `update activity_entries a set occurred_at = a.occurred_at - make_interval(secs => $5)
         from tasks t
        where t.organization_id = a.organization_id and t.id = a.task_id
          and t.organization_id = $1 and t.key_prefix = $2 and t.key_number = $3::int
          and a.kind = $4`,
      [atelierNordId, prefix, number, kind, seconds],
    );
  }

  /**
   * Creates a space as a member and checks the answer against the contract.
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
  ): Promise<z.output<typeof CreateSpaceInternalResponse>> {
    const response = await send('post', '/internal/v1/spaces', actor, { body, organizationId });
    expectStatus(response, 201);
    return conforms(CreateSpaceInternalResponse, bodyOf(response));
  }

  /**
   * Changes a space as a member and checks the answer against the contract.
   *
   * @param actor - Who changes.
   * @param spaceId - The space.
   * @param body - The merge patch.
   * @returns The space after the change.
   */
  async function patchSpace(actor: Person, spaceId: string, body: object): Promise<SpaceBody> {
    const response = await send('patch', `/internal/v1/spaces/${spaceId}`, actor, { body });
    expectStatus(response, 200);
    return conforms(UpdateSpaceInternalResponse, bodyOf(response));
  }

  /**
   * Creates a list in a space as a member and checks the answer against the contract.
   *
   * @param actor - Who creates.
   * @param spaceId - The space.
   * @param name - The name of the list.
   * @returns The list.
   */
  async function createList(actor: Person, spaceId: string, name: string): Promise<ListBody> {
    const response = await send('post', `/internal/v1/spaces/${spaceId}/lists`, actor, {
      body: { name },
    });
    expectStatus(response, 201);
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
    expectStatus(response, 201);
    return conforms(CreateTaskInternalResponse, bodyOf(response));
  }

  /**
   * Creates a subtask of a task and checks the answer against the contract.
   *
   * @param actor - Who creates.
   * @param parentKey - Key of the parent.
   * @param body - The subtask.
   * @returns The subtask.
   */
  async function createSubtask(actor: Person, parentKey: string, body: object): Promise<TaskBody> {
    const response = await send('post', `/internal/v1/tasks/${parentKey}/subtasks`, actor, {
      body,
    });
    expectStatus(response, 201);
    return conforms(CreateSubtaskInternalResponse, bodyOf(response));
  }

  /**
   * Reads a task as a member and checks the answer against the contract.
   *
   * @param actor - Who reads.
   * @param key - Key of the task.
   * @returns The task.
   */
  async function readTask(actor: Person, key: string): Promise<TaskBody> {
    const response = await send('get', `/internal/v1/tasks/${key}`, actor);
    expectStatus(response, 200);
    return conforms(GetTaskInternalResponse, bodyOf(response));
  }

  /**
   * Changes a task as a member and checks the answer against the contract.
   *
   * @param actor - Who changes.
   * @param key - Key of the task.
   * @param body - The merge patch.
   * @param headers - Headers of the call, such as `If-Match`.
   * @returns The task after the change.
   */
  async function patchTask(
    actor: Person,
    key: string,
    body: object,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<TaskBody> {
    const response = await send('patch', `/internal/v1/tasks/${key}`, actor, { body, headers });
    expectStatus(response, 200);
    return conforms(UpdateTaskInternalResponse, bodyOf(response));
  }

  /**
   * Assigns a person to a task as a member and checks the answer against the contract.
   *
   * @param actor - Who assigns.
   * @param key - Key of the task.
   * @param person - The person.
   * @returns The task after the change.
   */
  async function assign(actor: Person, key: string, person: Person): Promise<TaskBody> {
    const response = await send(
      'put',
      `/internal/v1/tasks/${key}/assignees/${person.userId}`,
      actor,
      { body: {} },
    );
    expectStatus(response, 200);
    return conforms(AssignTaskInternalResponse, bodyOf(response));
  }

  /**
   * Reads the activity of a task as a member and checks the answer against the contract.
   *
   * @param actor - Who reads.
   * @param key - Key of the task.
   * @param query - The query string, with its `?`.
   * @returns The page.
   */
  async function activityOf(actor: Person, key: string, query = ''): Promise<ActivityBody> {
    const response = await send('get', `/internal/v1/tasks/${key}/activity${query}`, actor);
    expectStatus(response, 200);
    return conforms(ListTaskActivityInternalResponse, bodyOf(response));
  }

  /**
   * Reads the activity of a list as a member and checks the answer against the contract.
   *
   * @param actor - Who reads.
   * @param listId - The list.
   * @param query - The query string, with its `?`.
   * @returns The page.
   */
  async function listActivityOf(actor: Person, listId: string, query = ''): Promise<ActivityBody> {
    const response = await send('get', `/internal/v1/lists/${listId}/activity${query}`, actor);
    expectStatus(response, 200);
    return conforms(ListListActivityInternalResponse, bodyOf(response));
  }

  /**
   * Runs work in the tenant transaction of an organization, as the module of a request would.
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
      JSON.stringify({ 'api-gateway': [gateway.publicJwk] }),
    );

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
    signer = await InternalTokenSigner.create({
      issuer: 'api-gateway',
      privateJwk: gateway.privateJwk,
    });

    // The people of Atelier Nord join as organization-service would announce them, and the second
    // organization gets its owner.
    const people: readonly (readonly [Person, MemberJoinedV1['role']])[] = [
      [camille, 'owner'],
      [ines, 'admin'],
      [hugo, 'member'],
      [lea, 'member'],
      [nadia, 'guest'],
      [mathis, 'member'],
      [chloe, 'member'],
      [noe, 'member'],
      [theo, 'member'],
      ...crowd.map((person): readonly [Person, MemberJoinedV1['role']] => [person, 'member']),
    ];
    for (const [person, role] of people) {
      publish(toPublishedEvent('joined', atelierNordId, person, role, 1));
    }
    publish(toPublishedEvent('joined', atelierDeltaId, solene, 'owner', 1));
    await vi.waitFor(
      async () => {
        expect(await activeMembers(atelierNordId)).toEqual(
          people.map(([person]) => person.userId).sort(),
        );
        expect(await activeMembers(atelierDeltaId)).toEqual([solene.userId]);
      },
      { timeout: 90_000, interval: 500 },
    );

    // The spaces the scenarios work in. The keys of Produit start at CAD-482, the task of the
    // mockup: the counter stands at 481.
    const created = await createSpace(camille, {
      name: 'Produit',
      prefix: 'CAD',
      icon: 'rocket',
      color: 'violet',
    });
    produit = created.space;
    produitList = created.firstList;
    await asSystem(
      `update space_prefixes set last_number = 481 where organization_id = $1 and prefix = 'CAD'`,
      [atelierNordId],
    );
    const sprintResponse = await send('post', `/internal/v1/spaces/${produit.id}/lists`, camille, {
      body: {
        name: 'Sprint 14',
        sprint: {
          startDate: '2026-11-03',
          endDate: '2026-11-17',
          goal: 'Stabiliser la vue calendrier',
        },
      },
    });
    expectStatus(sprintResponse, 201);
    sprint14 = conforms(CreateListInternalResponse, bodyOf(sprintResponse));

    const marketingCreated = await createSpace(camille, { name: 'Marketing', prefix: 'MKT' });
    marketing = await patchSpace(camille, marketingCreated.space.id, {
      statuses: { waiting: { hidden: true }, blocked: { hidden: true } },
    });
    marketingList = marketingCreated.firstList;

    const rechercheCreated = await createSpace(hugo, {
      name: 'Recherche',
      prefix: 'RCH',
      visibility: 'private',
    });
    recherche = rechercheCreated.space;
    rechercheList = rechercheCreated.firstList;

    const directionCreated = await createSpace(camille, {
      name: 'Direction',
      prefix: 'DIR',
      visibility: 'private',
    });
    directionList = directionCreated.firstList;
  }, 300_000);

  afterAll(async () => {
    try {
      await app?.close();
      await migrator.end();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  });

  describe('every route answers as the contract says, with its Location and ETag', () => {
    let cad482: TaskBody;

    it('creates "Refondre l’écran de connexion SSO" in Sprint 14 with 201, Location, ETag and its subtasks', async () => {
      const response = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
        body: {
          name: 'Refondre l’écran de connexion SSO',
          description: 'Reprendre le parcours **SSO** de la maquette.',
          priority: 'haute',
          assigneeIds: [camille.userId, hugo.userId],
          dueDate: '2026-11-13',
          startDate: '2026-11-09',
          estimateMinutes: 480,
          labels: ['Design', 'Auth'],
          subtasks: [{ name: 'Maquette validée' }, { name: 'Revue sécurité' }],
        },
      });

      expectStatus(response, 201);
      cad482 = conforms(CreateTaskInternalResponse, bodyOf(response));
      expect(response.headers.location).toBe('/internal/v1/tasks/CAD-482');
      expect(response.headers.etag).toBe('"1"');
      expect(cad482).toMatchObject({
        key: 'CAD-482',
        name: 'Refondre l’écran de connexion SSO',
        description: 'Reprendre le parcours **SSO** de la maquette.',
        status: 'todo',
        cancelReason: null,
        cancelNote: null,
        priority: 'haute',
        assignees: [{ userId: camille.userId }, { userId: hugo.userId }],
        dueDate: '2026-11-13',
        startDate: '2026-11-09',
        estimateMinutes: 480,
        labels: ['Design', 'Auth'],
        parentKey: null,
        listId: sprint14.id,
        spaceId: produit.id,
        subtaskCounts: { total: 2, closed: 0 },
        checklist: [],
        checklistCounts: { total: 0, done: 0 },
        completedAt: null,
        createdBy: { type: 'user', id: camille.userId },
        version: 1,
      });
    });

    it('reads the task with 200 and the ETag of its version', async () => {
      const response = await send('get', '/internal/v1/tasks/CAD-482', lea);

      expectStatus(response, 200);
      expect(conforms(GetTaskInternalResponse, bodyOf(response))).toEqual(cad482);
      expect(response.headers.etag).toBe('"1"');
    });

    it('reads the detail with its space, its list, its parent and its subtasks, and the ETag of the task', async () => {
      const response = await send('get', '/internal/v1/tasks/CAD-482/detail', lea);
      const subtaskDetail = await send('get', '/internal/v1/tasks/CAD-483/detail', lea);

      expectStatus(response, 200);
      const detail: TaskDetailBody = conforms(GetTaskDetailInternalResponse, bodyOf(response));
      expect(response.headers.etag).toBe('"1"');
      expect(detail.task).toEqual(cad482);
      expect(detail.space).toMatchObject({ id: produit.id, prefix: 'CAD' });
      expect(detail.list).toMatchObject({ id: sprint14.id, name: 'Sprint 14' });
      expect(detail.parent).toBeNull();
      expect(detail.subtasks.map((subtask) => subtask.key)).toEqual(['CAD-483', 'CAD-484']);
      expectStatus(subtaskDetail, 200);
      expect(conforms(GetTaskDetailInternalResponse, bodyOf(subtaskDetail)).parent).toEqual({
        key: 'CAD-482',
        name: 'Refondre l’écran de connexion SSO',
        status: 'todo',
      });
    });

    it('changes the description with If-Match, answering 200 with the next version as ETag', async () => {
      const response = await send('patch', '/internal/v1/tasks/CAD-482', camille, {
        body: { description: 'Reprendre le parcours **SSO** et le message d’erreur.' },
        headers: { 'If-Match': '"1"' },
      });

      expectStatus(response, 200);
      cad482 = conforms(UpdateTaskInternalResponse, bodyOf(response));
      expect(response.headers.etag).toBe('"2"');
      expect(cad482).toMatchObject({
        description: 'Reprendre le parcours **SSO** et le message d’erreur.',
        version: 2,
      });
    });

    it('assigns Léa with 200 and the next ETag, and unassigns her with 204 and the ETag of the version after', async () => {
      const assigned = await send(
        'put',
        `/internal/v1/tasks/CAD-482/assignees/${lea.userId}`,
        camille,
        { body: {} },
      );

      expectStatus(assigned, 200);
      const task = conforms(AssignTaskInternalResponse, bodyOf(assigned));
      expect(assigned.headers.etag).toBe('"3"');
      expect(task.assignees.map((person) => person.userId)).toEqual([
        camille.userId,
        hugo.userId,
        lea.userId,
      ]);

      const unassigned = await send(
        'delete',
        `/internal/v1/tasks/CAD-482/assignees/${lea.userId}`,
        camille,
      );

      expectStatus(unassigned, 204);
      expect(unassigned.headers.etag).toBe('"4"');
      expect(unassigned.text).toBe('');
      expect((await readTask(camille, 'CAD-482')).assignees).toEqual([
        { userId: camille.userId },
        { userId: hugo.userId },
      ]);
    });

    it('adds and removes a label with 200 and the next ETag each time', async () => {
      const added = await send('post', '/internal/v1/tasks/CAD-482/labels/add', camille, {
        body: { name: 'Revue' },
      });
      const removed = await send('post', '/internal/v1/tasks/CAD-482/labels/remove', camille, {
        body: { name: 'Revue' },
      });

      expectStatus(added, 200);
      expect(conforms(AddTaskLabelInternalResponse, bodyOf(added)).labels).toEqual([
        'Design',
        'Auth',
        'Revue',
      ]);
      expect(added.headers.etag).toBe('"5"');
      expectStatus(removed, 200);
      expect(conforms(RemoveTaskLabelInternalResponse, bodyOf(removed)).labels).toEqual([
        'Design',
        'Auth',
      ]);
      expect(removed.headers.etag).toBe('"6"');
    });

    it('lists the subtasks in the order of creation and creates one more with 201, Location and ETag', async () => {
      const listed = await send('get', '/internal/v1/tasks/CAD-482/subtasks', lea);

      expectStatus(listed, 200);
      const page = conforms(ListSubtasksInternalResponse, bodyOf(listed));
      expect(page.items.map((item) => item.key)).toEqual(['CAD-483', 'CAD-484']);
      expect(page).toMatchObject({ nextCursor: null, total: 2 });

      const response = await send('post', '/internal/v1/tasks/CAD-482/subtasks', camille, {
        body: { name: 'Brancher le fournisseur d’identité' },
      });

      expectStatus(response, 201);
      const subtask = conforms(CreateSubtaskInternalResponse, bodyOf(response));
      expect(response.headers.location).toBe('/internal/v1/tasks/CAD-485');
      expect(response.headers.etag).toBe('"1"');
      expect(subtask).toMatchObject({
        key: 'CAD-485',
        parentKey: 'CAD-482',
        listId: sprint14.id,
        status: 'todo',
        priority: 'moyenne',
        assignees: [{ userId: camille.userId }],
        version: 1,
      });
      expect(await readTask(camille, 'CAD-482')).toMatchObject({
        subtaskCounts: { total: 3, closed: 0 },
        version: 6,
      });
    });

    it('adds a checklist item with 201, its own Location and the ETag, and ticks it with 200', async () => {
      const added = await send('post', '/internal/v1/tasks/CAD-482/checklist-items', camille, {
        body: { text: 'Valider le message d’erreur avec Inès' },
      });

      expectStatus(added, 201);
      const task = conforms(AddChecklistItemInternalResponse, bodyOf(added));
      const [item] = task.checklist;
      expect(item).toMatchObject({ text: 'Valider le message d’erreur avec Inès', done: false });
      expect(added.headers.location).toBe(
        `/internal/v1/tasks/CAD-482/checklist-items/${item?.id ?? ''}`,
      );
      expect(added.headers.etag).toBe('"7"');
      expect(task.checklistCounts).toEqual({ total: 1, done: 0 });

      const ticked = await send(
        'patch',
        `/internal/v1/tasks/CAD-482/checklist-items/${item?.id ?? ''}`,
        camille,
        { body: { done: true } },
      );

      expectStatus(ticked, 200);
      const after = conforms(UpdateChecklistItemInternalResponse, bodyOf(ticked));
      expect(ticked.headers.etag).toBe('"8"');
      expect(after.checklist).toEqual([{ id: item?.id, text: item?.text, done: true }]);
      expect(after.checklistCounts).toEqual({ total: 1, done: 1 });
    });

    it('reads the activity of the task and of its list against the contract', async () => {
      const task = await activityOf(lea, 'CAD-482');
      const list = await listActivityOf(lea, sprint14.id);

      expect(task.items.map((entry) => entry.kind)).toEqual(['assign', 'assign', 'create']);
      expect(task).toMatchObject({ nextCursor: null, total: 3 });
      expect(list.total).toBeGreaterThanOrEqual(5);
      expect(list.items.map((entry) => entry.task.key)).toContain('CAD-482');
    });
  });

  describe('keys are given once, in order, and kept for good', () => {
    it('gives the subtasks of a creation the keys after the task, and the next creation the one after them', async () => {
      const task = await createTask(camille, produitList.id, {
        name: 'Préparer la démo',
        subtasks: [{ name: 'Jeu de données' }, { name: 'Script' }],
      });
      const subtasks = await send('get', `/internal/v1/tasks/${task.key}/subtasks`, camille);
      const next = await createTask(camille, produitList.id, { name: 'Publier la démo' });

      expect(
        conforms(ListSubtasksInternalResponse, bodyOf(subtasks)).items.map((item) =>
          numberOf(item.key),
        ),
      ).toEqual([numberOf(task.key) + 1, numberOf(task.key) + 2]);
      expect(numberOf(next.key)).toBe(numberOf(task.key) + 3);
    });

    it('keeps the key of a task moved to another space, and gives the new tasks of that space its prefix', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Rédiger la newsletter' });

      const moved = await patchTask(camille, task.key, { listId: marketingList.id });
      const fresh = await createTask(camille, marketingList.id, { name: 'Planifier l’envoi' });

      expect(moved).toMatchObject({
        key: task.key,
        spaceId: marketing.id,
        listId: marketingList.id,
      });
      expect(await readTask(camille, task.key)).toMatchObject({ spaceId: marketing.id });
      expect(fresh.key).toMatch(/^MKT-[1-9][0-9]*$/u);
    });

    it('resolves the old keys after a prefix change, gives the new tasks the new prefix, and continues the numbers of a prefix taken back', async () => {
      const created = await createSpace(camille, { name: 'Support', prefix: 'SUP' });
      const first = await createTask(camille, created.firstList.id, {
        name: 'Répondre à Atelier Sud',
      });
      const second = await createTask(camille, created.firstList.id, { name: 'Trier les tickets' });

      await patchSpace(camille, created.space.id, { prefix: 'HLP' });
      const renamed = await createTask(camille, created.firstList.id, { name: 'Écrire la FAQ' });
      await patchSpace(camille, created.space.id, { prefix: 'SUP' });
      const taken = await createTask(camille, created.firstList.id, { name: 'Former Léa' });

      expect([first.key, second.key, renamed.key, taken.key]).toEqual([
        'SUP-1',
        'SUP-2',
        'HLP-1',
        'SUP-3',
      ]);
      for (const key of [first.key, second.key, renamed.key, taken.key]) {
        expect(await readTask(camille, key)).toMatchObject({ spaceId: created.space.id });
      }
    });

    it('answers 400 request.invalid to a key in lower case or padded with zeros, on every route that names a task', async () => {
      for (const key of ['cad-482', 'CAD-0482', 'CAD-0', 'CAD482', 'C-482', 'CADENCE-482']) {
        for (const suffix of ['', '/detail', '/subtasks', '/activity']) {
          expectProblem(
            await send('get', `/internal/v1/tasks/${key}${suffix}`, camille),
            400,
            'request.invalid',
          );
        }
      }
      expectProblem(
        await send('patch', '/internal/v1/tasks/cad-482', camille, { body: { name: 'Autre' } }),
        400,
        'request.invalid',
      );
    });
  });

  describe('a task is seen by whoever sees its space, and by nobody else', () => {
    let carnet: TaskBody;

    it('answers 404 task.not-found to the owner, the admin and a member on every route of a task of a private space', async () => {
      carnet = await createTask(hugo, rechercheList.id, {
        name: 'Carnet de recherche',
        subtasks: [{ name: 'Entretiens' }],
      });
      const item = await send('post', `/internal/v1/tasks/${carnet.key}/checklist-items`, hugo, {
        body: { text: 'Planifier' },
      });
      expectStatus(item, 201);
      const itemId = conforms(AddChecklistItemInternalResponse, bodyOf(item)).checklist[0]?.id;

      expect(await readTask(hugo, carnet.key)).toMatchObject({ key: carnet.key });
      for (const viewer of [camille, ines, lea]) {
        const key = carnet.key;
        const calls = [
          await send('get', `/internal/v1/tasks/${key}`, viewer),
          await send('get', `/internal/v1/tasks/${key}/detail`, viewer),
          await send('get', `/internal/v1/tasks/${key}/subtasks`, viewer),
          await send('get', `/internal/v1/tasks/${key}/activity`, viewer),
          await send('patch', `/internal/v1/tasks/${key}`, viewer, { body: { name: 'Autre' } }),
          await send('put', `/internal/v1/tasks/${key}/assignees/${lea.userId}`, viewer, {
            body: {},
          }),
          await send('delete', `/internal/v1/tasks/${key}/assignees/${hugo.userId}`, viewer),
          await send('post', `/internal/v1/tasks/${key}/labels/add`, viewer, {
            body: { name: 'Fuite' },
          }),
          await send('post', `/internal/v1/tasks/${key}/labels/remove`, viewer, {
            body: { name: 'Fuite' },
          }),
          await send('post', `/internal/v1/tasks/${key}/subtasks`, viewer, {
            body: { name: 'Fuite' },
          }),
          await send('post', `/internal/v1/tasks/${key}/checklist-items`, viewer, {
            body: { text: 'Fuite' },
          }),
          await send('patch', `/internal/v1/tasks/${key}/checklist-items/${itemId ?? ''}`, viewer, {
            body: { done: true },
          }),
        ];
        for (const response of calls) {
          expectProblem(response, 404, 'task.not-found');
        }
        expect(await readTask(hugo, key)).toMatchObject({
          name: 'Carnet de recherche',
          version: 2,
        });
      }
    });

    it('answers 404 list.not-found to them on the list of the private space: no creation, no activity', async () => {
      const before = await countRows('tasks', 'space_id = $2', recherche.id);

      for (const viewer of [camille, ines, lea]) {
        expectProblem(
          await send('post', `/internal/v1/lists/${rechercheList.id}/tasks`, viewer, {
            body: { name: 'Intrusion' },
          }),
          404,
          'list.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/lists/${rechercheList.id}/activity`, viewer),
          404,
          'list.not-found',
        );
      }
      expect(await countRows('tasks', 'space_id = $2', recherche.id)).toBe(before);
      expect((await listActivityOf(hugo, rechercheList.id)).items.length).toBeGreaterThan(0);
    });

    it('shows a guest no task, no list and no activity: 404 on every route', async () => {
      const task = await readTask(camille, 'CAD-482');

      const calls = [
        await send('get', `/internal/v1/tasks/${task.key}`, nadia),
        await send('get', `/internal/v1/tasks/${task.key}/detail`, nadia),
        await send('get', `/internal/v1/tasks/${task.key}/subtasks`, nadia),
        await send('get', `/internal/v1/tasks/${task.key}/activity`, nadia),
        await send('patch', `/internal/v1/tasks/${task.key}`, nadia, { body: { name: 'Autre' } }),
        await send('post', `/internal/v1/tasks/${task.key}/subtasks`, nadia, {
          body: { name: 'Autre' },
        }),
      ];
      for (const response of calls) {
        expectProblem(response, 404, 'task.not-found');
      }
      expectProblem(
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, nadia, {
          body: { name: 'Autre' },
        }),
        404,
        'list.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/lists/${sprint14.id}/activity`, nadia),
        404,
        'list.not-found',
      );
      expect(await readTask(camille, task.key)).toMatchObject({ version: task.version });
    });

    it('answers 404 organization.not-found to an actor the copy does not know, on every route', async () => {
      const stranger = { userId: randomUUID() };
      const before = await countRows('tasks', 'true');

      const calls = [
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, stranger, {
          body: { name: 'Fantôme' },
        }),
        await send('get', `/internal/v1/lists/${sprint14.id}/activity`, stranger),
        await send('get', '/internal/v1/tasks/CAD-482', stranger),
        await send('get', '/internal/v1/tasks/CAD-482/detail', stranger),
        await send('get', '/internal/v1/tasks/CAD-482/subtasks', stranger),
        await send('get', '/internal/v1/tasks/CAD-482/activity', stranger),
        await send('patch', '/internal/v1/tasks/CAD-482', stranger, { body: { name: 'Autre' } }),
        await send('put', `/internal/v1/tasks/CAD-482/assignees/${hugo.userId}`, stranger, {
          body: {},
        }),
        await send('post', '/internal/v1/tasks/CAD-482/labels/add', stranger, {
          body: { name: 'Fuite' },
        }),
      ];
      for (const response of calls) {
        expectProblem(response, 404, 'organization.not-found');
      }
      expect(await countRows('tasks', 'true')).toBe(before);
    });
  });

  describe('the status of a task follows the rules of its space and of its cancellation', () => {
    it('refuses a status the space hides with 422 task.status-hidden and the status in details, on creation and on change', async () => {
      const before = await countRows('tasks', `name = 'Relancer les partenaires'`);

      const created = await send('post', `/internal/v1/lists/${marketingList.id}/tasks`, camille, {
        body: { name: 'Relancer les partenaires', status: 'waiting' },
      });
      const task = await createTask(camille, marketingList.id, {
        name: 'Relancer les partenaires',
      });
      const changed = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { status: 'blocked' },
      });

      expectProblem(created, 422, 'task.status-hidden', { status: 'waiting' });
      expectProblem(changed, 422, 'task.status-hidden', { status: 'blocked' });
      expect(await countRows('tasks', `name = 'Relancer les partenaires'`)).toBe(before + 1);
      expect(await readTask(camille, task.key)).toMatchObject({ status: 'todo', version: 1 });
    });

    it('requires a cancel reason to cancel, trims the note, and clears both when the task leaves "cancelled"', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Migrer l’ancien espace' });

      const without = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { status: 'cancelled' },
      });
      const withNull = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { status: 'cancelled', cancelReason: null },
      });
      const cancelled = await patchTask(camille, task.key, {
        status: 'cancelled',
        cancelReason: 'duplicate',
        cancelNote: '  Doublon de CAD-470  ',
      });
      const renoted = await patchTask(camille, task.key, { cancelNote: 'Doublon de CAD-471' });
      const reopened = await patchTask(camille, task.key, { status: 'todo' });

      expectProblem(without, 422, 'task.cancel-reason-required');
      expectProblem(withNull, 422, 'task.cancel-reason-required');
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelReason: 'duplicate',
        cancelNote: 'Doublon de CAD-470',
        completedAt: null,
        version: 2,
      });
      expect(renoted).toMatchObject({
        status: 'cancelled',
        cancelReason: 'duplicate',
        cancelNote: 'Doublon de CAD-471',
        version: 3,
      });
      expect(reopened).toMatchObject({
        status: 'todo',
        cancelReason: null,
        cancelNote: null,
        version: 4,
      });
    });

    it('refuses a cancel reason or a note on a task that is not cancelled with 422 task.cancel-reason-unexpected, and accepts null as "none"', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Vérifier les droits' });

      const reason = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { cancelReason: 'scope' },
      });
      const note = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { cancelNote: 'Hors périmètre' },
      });
      const none = await patchTask(camille, task.key, { cancelReason: null, cancelNote: null });
      const onCreation = await send('post', `/internal/v1/lists/${produitList.id}/tasks`, camille, {
        body: { name: 'Vérifier les droits', cancelReason: 'obsolete' },
      });
      const cancelledOnCreation = await send(
        'post',
        `/internal/v1/lists/${produitList.id}/tasks`,
        camille,
        { body: { name: 'Vérifier les droits', status: 'cancelled' } },
      );

      expectProblem(reason, 422, 'task.cancel-reason-unexpected');
      expectProblem(note, 422, 'task.cancel-reason-unexpected');
      expect(none).toMatchObject({ version: 1, cancelReason: null, cancelNote: null });
      expectProblem(onCreation, 422, 'task.cancel-reason-unexpected');
      expectProblem(cancelledOnCreation, 422, 'task.cancel-reason-required');
    });

    it('sets completedAt when the task enters "done", keeps it from done to done, and clears it when the task leaves', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Livrer la v2' });

      const done = await patchTask(camille, task.key, { status: 'done' });
      const stillDone = await patchTask(camille, task.key, { status: 'done', priority: 'haute' });
      const reopened = await patchTask(camille, task.key, { status: 'progress' });
      const doneAgain = await patchTask(camille, task.key, { status: 'done' });

      expect(task.completedAt).toBeNull();
      expect(done.completedAt).not.toBeNull();
      expect(stillDone).toMatchObject({ completedAt: done.completedAt, priority: 'haute' });
      expect(reopened.completedAt).toBeNull();
      expect(doneAgain.completedAt).not.toBeNull();
      expect(new Date(doneAgain.completedAt ?? 0).getTime()).toBeGreaterThan(
        new Date(done.completedAt ?? 0).getTime(),
      );
    });

    it('keeps the status of a task moved into a space that hides it, and checks a new status of the same patch against that space', async () => {
      const waiting = await createTask(camille, produitList.id, {
        name: 'Attendre le retour du client',
        status: 'waiting',
      });
      const other = await createTask(camille, produitList.id, { name: 'Choisir le fournisseur' });

      const refused = await send('patch', `/internal/v1/tasks/${other.key}`, camille, {
        body: { listId: marketingList.id, status: 'blocked' },
      });
      expect(await readTask(camille, other.key)).toMatchObject({
        listId: produitList.id,
        version: 1,
      });
      const moved = await patchTask(camille, waiting.key, { listId: marketingList.id });
      const same = await patchTask(camille, waiting.key, { status: 'waiting' });
      const away = await send('patch', `/internal/v1/tasks/${waiting.key}`, camille, {
        body: { status: 'blocked' },
      });
      const movedWithStatus = await patchTask(camille, other.key, {
        listId: marketingList.id,
        status: 'progress',
      });

      expectProblem(refused, 422, 'task.status-hidden', { status: 'blocked' });
      expect(moved).toMatchObject({ status: 'waiting', spaceId: marketing.id, version: 2 });
      expect(same.version).toBe(2);
      expectProblem(away, 422, 'task.status-hidden', { status: 'blocked' });
      expect(movedWithStatus).toMatchObject({ status: 'progress', spaceId: marketing.id });
    });
  });

  describe('the start of a task needs its due date and follows it', () => {
    it('refuses a start without a due date, and a start after the due date, with 422 task.start-date-invalid', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Planifier la recette' });

      const noDue = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
        body: { name: 'Sans échéance', startDate: '2026-12-01' },
      });
      const afterDue = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
        body: { name: 'Départ tardif', startDate: '2026-12-05', dueDate: '2026-12-04' },
      });
      const patchedNoDue = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { startDate: '2026-12-01' },
      });
      const patchedAfter = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { dueDate: '2026-12-04', startDate: '2026-12-05' },
      });

      for (const response of [noDue, afterDue, patchedNoDue, patchedAfter]) {
        expectProblem(response, 422, 'task.start-date-invalid');
      }
      expect(await countRows('tasks', `name in ('Sans échéance', 'Départ tardif')`)).toBe(0);
      expect(await readTask(camille, task.key)).toMatchObject({ version: 1, dueDate: null });
    });

    it('moves the start with the due date and keeps the duration, and removes the start with the due date', async () => {
      const task = await createTask(camille, sprint14.id, {
        name: 'Préparer la recette',
        dueDate: '2026-12-04',
        startDate: '2026-12-01',
      });

      const shifted = await patchTask(camille, task.key, { dueDate: '2026-12-11' });
      const earlier = await patchTask(camille, task.key, { dueDate: '2026-12-09' });
      const explicit = await patchTask(camille, task.key, {
        dueDate: '2026-12-20',
        startDate: '2026-12-18',
      });
      const startOnly = await patchTask(camille, task.key, { startDate: '2026-12-19' });
      const removed = await patchTask(camille, task.key, { dueDate: null });

      expect(shifted).toMatchObject({ dueDate: '2026-12-11', startDate: '2026-12-08', version: 2 });
      expect(earlier).toMatchObject({ dueDate: '2026-12-09', startDate: '2026-12-06', version: 3 });
      expect(explicit).toMatchObject({
        dueDate: '2026-12-20',
        startDate: '2026-12-18',
        version: 4,
      });
      expect(startOnly).toMatchObject({
        dueDate: '2026-12-20',
        startDate: '2026-12-19',
        version: 5,
      });
      expect(removed).toMatchObject({ dueDate: null, startDate: null, version: 6 });
      const events = await outboxOfKeys(task.key);
      const changes = events
        .filter((event) => event.event_name === 'task.updated.v1')
        .map((event) => conforms(taskEventSchemas['task.updated.v1'], event.payload).changed);
      expect(changes[0]).toEqual(expect.arrayContaining(['dueDate', 'startDate']));
      expect(changes[3]).toEqual(['startDate']);
    });

    it('records one due-date entry for a move of the due date that moves the start too', async () => {
      const task = await createTask(camille, sprint14.id, {
        name: 'Caler la recette',
        dueDate: '2026-12-04',
        startDate: '2026-12-01',
      });

      await patchTask(camille, task.key, { dueDate: '2026-12-11' });
      await patchTask(camille, task.key, { startDate: '2026-12-09' });

      const page = await activityOf(camille, task.key, '?kind=due');
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        kind: 'due',
        dueDate: { from: '2026-12-04', to: '2026-12-11' },
      });
    });
  });

  describe('If-Match guards a change against a stale version', () => {
    it('answers 412 request.version-mismatch with the stored version, and accepts the current one and "*"', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Auditer les accès' });
      const renamed = await patchTask(camille, task.key, { name: 'Auditer les accès SSO' });

      const stale = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { name: 'Autre nom' },
        headers: { 'If-Match': '"1"' },
      });
      const current = await patchTask(
        camille,
        task.key,
        { name: 'Auditer les accès SSO et API' },
        { 'If-Match': `"${String(renamed.version)}"` },
      );
      const star = await patchTask(camille, task.key, { priority: 'urgente' }, { 'If-Match': '*' });

      expectProblem(stale, 412, 'request.version-mismatch', { version: 2 });
      expect(current).toMatchObject({ name: 'Auditer les accès SSO et API', version: 3 });
      expect(star).toMatchObject({ priority: 'urgente', version: 4 });
    });

    it('answers 412 on the assignment, the unassignment, the labels and the tick of a checklist item with a stale version', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Relire les contrats' });
      const withItem = await send(
        'post',
        `/internal/v1/tasks/${task.key}/checklist-items`,
        camille,
        {
          body: { text: 'Clause 4' },
        },
      );
      const itemId = conforms(AddChecklistItemInternalResponse, bodyOf(withItem)).checklist[0]?.id;
      const stale = { 'If-Match': '"1"' };

      const calls = [
        await send('put', `/internal/v1/tasks/${task.key}/assignees/${hugo.userId}`, camille, {
          body: {},
          headers: stale,
        }),
        await send('delete', `/internal/v1/tasks/${task.key}/assignees/${hugo.userId}`, camille, {
          headers: stale,
        }),
        await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
          body: { name: 'Juridique' },
          headers: stale,
        }),
        await send('post', `/internal/v1/tasks/${task.key}/labels/remove`, camille, {
          body: { name: 'Juridique' },
          headers: stale,
        }),
        await send(
          'patch',
          `/internal/v1/tasks/${task.key}/checklist-items/${itemId ?? ''}`,
          camille,
          { body: { done: true }, headers: stale },
        ),
      ];

      for (const response of calls) {
        expectProblem(response, 412, 'request.version-mismatch', { version: 2 });
      }
      expect(await readTask(camille, task.key)).toMatchObject({
        assignees: [],
        labels: [],
        checklist: [{ done: false }],
        version: 2,
      });
    });

    it('answers 400 request.invalid with an issue on If-Match for a description without the header, and accepts "*" and the version', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Documenter l’API' });
      const before = await countTaskEvents();

      const missing = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { description: 'Voir le wiki.' },
      });
      const missingNull = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { description: null },
      });
      const star = await patchTask(
        camille,
        task.key,
        { description: 'Voir le wiki.' },
        { 'If-Match': '*' },
      );
      const exact = await patchTask(
        camille,
        task.key,
        { description: 'Voir le wiki et le guide.' },
        { 'If-Match': `"${String(star.version)}"` },
      );

      for (const response of [missing, missingNull]) {
        expectProblem(response, 400, 'request.invalid');
        expect(bodyOf(response)).toMatchObject({
          details: { issues: [{ in: 'header', path: 'If-Match', code: 'invalid_type' }] },
        });
      }
      expect(star).toMatchObject({ description: 'Voir le wiki.', version: 2 });
      expect(exact).toMatchObject({ description: 'Voir le wiki et le guide.', version: 3 });
      expect(await countTaskEvents()).toBe(before + 2);
    });

    it('answers 200 with the same version, and appends no event and no entry, for a patch that changes nothing', async () => {
      const task = await createTask(camille, produitList.id, {
        name: 'Compter les inscriptions',
        priority: 'haute',
      });
      const events = await countTaskEvents();
      const entries = await countRows('activity_entries', 'true');

      const empty = await send('patch', `/internal/v1/tasks/${task.key}`, camille, { body: {} });
      const same = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { name: 'Compter les inscriptions', priority: 'haute', dueDate: null },
      });

      for (const response of [empty, same]) {
        expectStatus(response, 200);
        expect(conforms(UpdateTaskInternalResponse, bodyOf(response))).toEqual(task);
        expect(response.headers.etag).toBe('"1"');
      }
      expect(await countTaskEvents()).toBe(events);
      expect(await countRows('activity_entries', 'true')).toBe(entries);
    });
  });

  describe('subtasks: three levels, twenty-five children, and a subtask stays in the list of its parent', () => {
    it('refuses a fourth level with 422 task.subtask-depth-exceeded, on creation and on attachment', async () => {
      const top = await createTask(camille, produitList.id, { name: 'Niveau 1' });
      const second = await createSubtask(camille, top.key, { name: 'Niveau 2' });
      const third = await createSubtask(camille, second.key, { name: 'Niveau 3' });
      const crowded = await createTask(camille, produitList.id, {
        name: 'Arbre à deux niveaux',
        subtasks: [{ name: 'Feuille' }],
      });

      const created = await send('post', `/internal/v1/tasks/${third.key}/subtasks`, camille, {
        body: { name: 'Niveau 4' },
      });
      const attached = await send('patch', `/internal/v1/tasks/${crowded.key}`, camille, {
        body: { parentKey: second.key },
      });
      const attachedUnder = await patchTask(camille, crowded.key, { parentKey: top.key });

      expectProblem(created, 422, 'task.subtask-depth-exceeded');
      expectProblem(attached, 422, 'task.subtask-depth-exceeded');
      expect(attachedUnder.parentKey).toBe(top.key);
      expect(await readTask(camille, top.key)).toMatchObject({
        subtaskCounts: { total: 2, closed: 0 },
      });
    });

    it('refuses a twenty-sixth direct subtask with 422 task.subtask-limit-reached, on creation and on attachment', async () => {
      const full = await createTask(camille, produitList.id, {
        name: 'Plan de test',
        subtasks: Array.from({ length: 25 }, (_, index) => ({ name: `Cas ${String(index + 1)}` })),
      });
      const loose = await createTask(camille, produitList.id, { name: 'Cas supplémentaire' });

      const created = await send('post', `/internal/v1/tasks/${full.key}/subtasks`, camille, {
        body: { name: 'Cas 26' },
      });
      const attached = await send('patch', `/internal/v1/tasks/${loose.key}`, camille, {
        body: { parentKey: full.key },
      });

      expect(full.subtaskCounts).toEqual({ total: 25, closed: 0 });
      expectProblem(created, 422, 'task.subtask-limit-reached');
      expectProblem(attached, 422, 'task.subtask-limit-reached');
      const page = await send('get', `/internal/v1/tasks/${full.key}/subtasks?limit=100`, camille);
      expect(conforms(ListSubtasksInternalResponse, bodyOf(page))).toMatchObject({ total: 25 });
      const [first] = conforms(ListSubtasksInternalResponse, bodyOf(page)).items;
      await patchTask(camille, first?.key ?? '', { parentKey: null });
      expect((await createSubtask(camille, full.key, { name: 'Cas 26' })).parentKey).toBe(full.key);
    });

    it('attaches a task with its subtree to the list of its new parent, and detaches it into the same list', async () => {
      const parent = await createTask(camille, produitList.id, { name: 'Lot recette' });
      const loose = await createTask(camille, sprint14.id, {
        name: 'Cas d’usage SSO',
        subtasks: [{ name: 'Cas passant' }],
      });
      const parentBefore = await readTask(camille, parent.key);

      const attached = await patchTask(camille, loose.key, { parentKey: parent.key });

      expect(attached).toMatchObject({
        parentKey: parent.key,
        listId: produitList.id,
        version: 2,
      });
      expect(await readTask(camille, numberedKey(loose.key, 1))).toMatchObject({
        listId: produitList.id,
        parentKey: loose.key,
        version: 2,
      });
      expect(await readTask(camille, parent.key)).toMatchObject({
        subtaskCounts: { total: 1, closed: 0 },
        version: parentBefore.version,
      });

      const detached = await patchTask(camille, loose.key, { parentKey: null });

      expect(detached).toMatchObject({ parentKey: null, listId: produitList.id, version: 3 });
      expect(await readTask(camille, parent.key)).toMatchObject({
        subtaskCounts: { total: 0, closed: 0 },
        version: parentBefore.version,
      });
    });

    it('detaches a subtask that is moved to another list, and announces the list and the parent it left', async () => {
      const parent = await createTask(camille, produitList.id, {
        name: 'Lot de tests',
        subtasks: [{ name: 'Test de charge' }],
      });
      const subtaskKey = numberedKey(parent.key, 1);

      const moved = await patchTask(camille, subtaskKey, { listId: sprint14.id });

      expect(moved).toMatchObject({ parentKey: null, listId: sprint14.id, version: 2 });
      expect(await readTask(camille, parent.key)).toMatchObject({
        subtaskCounts: { total: 0, closed: 0 },
        version: 1,
      });
      const updated = (await outboxOfKeys(subtaskKey)).filter(
        (event) => event.event_name === 'task.updated.v1',
      );
      expect(conforms(taskEventSchemas['task.updated.v1'], updated[0]?.payload)).toMatchObject({
        changed: expect.arrayContaining(['listId', 'parentKey']) as string[],
        parentKey: null,
        listId: sprint14.id,
      });
    });

    it('moves the subtree of a parent with it, and announces one task.updated.v1 per moved task', async () => {
      const parent = await createTask(camille, produitList.id, {
        name: 'Campagne d’automne',
        subtasks: [{ name: 'Visuels' }, { name: 'Textes' }],
      });
      const [visuels, textes] = [numberedKey(parent.key, 1), numberedKey(parent.key, 2)];
      const grandchild = await createSubtask(camille, visuels, { name: 'Bannières' });

      const moved = await patchTask(camille, parent.key, { listId: marketingList.id });

      expect(moved).toMatchObject({ listId: marketingList.id, spaceId: marketing.id, version: 2 });
      for (const key of [visuels, textes, grandchild.key]) {
        expect(await readTask(camille, key)).toMatchObject({
          listId: marketingList.id,
          spaceId: marketing.id,
          version: 2,
        });
      }
      expect(await readTask(camille, visuels)).toMatchObject({ parentKey: parent.key });
      for (const key of [parent.key, visuels, textes, grandchild.key]) {
        const updated = (await outboxOfKeys(key))
          .filter((event) => event.event_name === 'task.updated.v1')
          .map((event) => conforms(taskEventSchemas['task.updated.v1'], event.payload));
        expect(updated).toHaveLength(1);
        expect(updated[0]).toMatchObject({
          version: 2,
          listId: marketingList.id,
          spaceId: marketing.id,
          actor: { type: 'user', id: camille.userId },
        });
        expect(updated[0]?.changed).toEqual(expect.arrayContaining(['listId', 'spaceId']));
        expect(updated[0]?.changed).not.toContain('parentKey');
      }
    });

    it('refuses a parent that is unknown, unseen, the task itself or one of its descendants with 422 task.parent-invalid and its key', async () => {
      const top = await createTask(camille, produitList.id, { name: 'Racine' });
      const child = await createSubtask(camille, top.key, { name: 'Enfant' });
      const grandchild = await createSubtask(camille, child.key, { name: 'Petit-enfant' });
      const hidden = await createTask(hugo, rechercheList.id, { name: 'Note privée' });

      for (const parentKey of ['CAD-999999', hidden.key, top.key, grandchild.key]) {
        const response = await send('patch', `/internal/v1/tasks/${top.key}`, camille, {
          body: { parentKey },
        });
        expectProblem(response, 422, 'task.parent-invalid', { parentKey });
      }
      expect(await readTask(camille, top.key)).toMatchObject({ parentKey: null, version: 1 });
    });

    it('refuses a list that is unknown or unseen, and a list that is not the one of the new parent, with 422 task.list-invalid', async () => {
      const task = await createTask(camille, produitList.id, { name: 'À déplacer' });
      const parent = await createTask(camille, sprint14.id, { name: 'Futur parent' });

      const unknown = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { listId: randomUUID() },
      });
      const unseen = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { listId: rechercheList.id },
      });
      const notParentList = await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
        body: { parentKey: parent.key, listId: produitList.id },
      });
      const parentList = await patchTask(camille, task.key, {
        parentKey: parent.key,
        listId: sprint14.id,
      });

      for (const response of [unknown, unseen, notParentList]) {
        expectProblem(response, 422, 'task.list-invalid');
      }
      expect(parentList).toMatchObject({ parentKey: parent.key, listId: sprint14.id });
    });
  });

  describe('assignees are current members who are not guests, twenty at most', () => {
    it('refuses a guest, a stranger and a person of another organization with 422 task.assignee-invalid and their ids', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Choisir les parrains' });
      const stranger = randomUUID();

      for (const userId of [nadia.userId, stranger, solene.userId]) {
        expectProblem(
          await send('put', `/internal/v1/tasks/${task.key}/assignees/${userId}`, camille, {
            body: {},
          }),
          422,
          'task.assignee-invalid',
          { userIds: [userId] },
        );
      }
      expect(await readTask(camille, task.key)).toMatchObject({ assignees: [], version: 1 });
    });

    it('lists every invalid assignee of a creation, and creates nothing', async () => {
      const stranger = randomUUID();

      const response = await send('post', `/internal/v1/lists/${produitList.id}/tasks`, camille, {
        body: {
          name: 'Équipe de la démo',
          assigneeIds: [hugo.userId, nadia.userId, stranger],
        },
      });

      expectProblem(response, 422, 'task.assignee-invalid');
      expect([...(detailsOf(response).userIds as string[])].sort()).toEqual(
        [nadia.userId, stranger].sort(),
      );
      expect(await countRows('tasks', `name = 'Équipe de la démo'`)).toBe(0);
    });

    it('counts the same person once, and answers 200 with the same version for a person already assigned', async () => {
      const task = await createTask(camille, produitList.id, {
        name: 'Animer la rétrospective',
        assigneeIds: [hugo.userId, hugo.userId],
      });
      const events = await countTaskEvents();
      const entries = await countRows('activity_entries', 'true');

      const again = await send(
        'put',
        `/internal/v1/tasks/${task.key}/assignees/${hugo.userId}`,
        camille,
        {
          body: {},
        },
      );
      const upper = await send(
        'put',
        `/internal/v1/tasks/${task.key}/assignees/${hugo.userId.toUpperCase()}`,
        camille,
        { body: {} },
      );

      expect(task.assignees).toEqual([{ userId: hugo.userId }]);
      for (const response of [again, upper]) {
        expectStatus(response, 200);
        expect(conforms(AssignTaskInternalResponse, bodyOf(response))).toEqual(task);
        expect(response.headers.etag).toBe('"1"');
      }
      expect(await countTaskEvents()).toBe(events);
      expect(await countRows('activity_entries', 'true')).toBe(entries);
    });

    it('answers 204 with the current version for a person who is not assigned, and changes nothing', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Clore le trimestre' });
      const events = await countTaskEvents();

      const response = await send(
        'delete',
        `/internal/v1/tasks/${task.key}/assignees/${ines.userId}`,
        camille,
      );

      expectStatus(response, 204);
      expect(response.headers.etag).toBe('"1"');
      expect(await countTaskEvents()).toBe(events);
      expect(await readTask(camille, task.key)).toMatchObject({ version: 1 });
    });

    it('refuses a twenty-first assignee with 422 task.assignee-limit-reached, and still accepts one who is assigned', async () => {
      const task = await createTask(camille, produitList.id, {
        name: 'Journée portes ouvertes',
        assigneeIds: crowd.slice(0, 20).map((person) => person.userId),
      });

      const over = await send(
        'put',
        `/internal/v1/tasks/${task.key}/assignees/${crowd[20]?.userId ?? ''}`,
        camille,
        { body: {} },
      );
      const already = await assign(camille, task.key, crowd[0] ?? camille);

      expect(task.assignees).toHaveLength(20);
      expectProblem(over, 422, 'task.assignee-limit-reached');
      expect(already).toEqual(task);
    });

    it('records who was assigned and who left, by whom, and announces each assignment once', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Tenir le stand' });

      await assign(ines, task.key, lea);
      await send('delete', `/internal/v1/tasks/${task.key}/assignees/${lea.userId}`, camille);

      const page = await activityOf(camille, task.key, '?kind=assign');
      expect(page.items).toMatchObject([
        {
          actor: { type: 'user', id: camille.userId },
          assignee: { userId: lea.userId, added: false },
        },
        { actor: { type: 'user', id: ines.userId }, assignee: { userId: lea.userId, added: true } },
      ]);
      const events = (await outboxOfKeys(task.key)).map((event) => event.event_name);
      expect(events).toEqual([
        'task.created.v1',
        'task.updated.v1',
        'task.assigned.v1',
        'task.updated.v1',
      ]);
    });
  });

  describe('labels ignore case, and the checklist keeps its items in order', () => {
    it('adds a label trimmed, ignores one that differs only by case, and removes it whatever the case', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Classer les retours' });
      const first = await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
        body: { name: '  Design ' },
      });
      const events = await countTaskEvents();

      const again = await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
        body: { name: 'DESIGN' },
      });
      const accents = await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
        body: { name: 'Sécurité' },
      });
      const accentless = await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
        body: { name: 'Securite' },
      });

      expect(conforms(AddTaskLabelInternalResponse, bodyOf(first))).toMatchObject({
        labels: ['Design'],
        version: 2,
      });
      expect(conforms(AddTaskLabelInternalResponse, bodyOf(again))).toMatchObject({
        labels: ['Design'],
        version: 2,
      });
      expect(again.headers.etag).toBe('"2"');
      expect(conforms(AddTaskLabelInternalResponse, bodyOf(accents)).labels).toEqual([
        'Design',
        'Sécurité',
      ]);
      expect(conforms(AddTaskLabelInternalResponse, bodyOf(accentless)).labels).toEqual([
        'Design',
        'Sécurité',
        'Securite',
      ]);
      expect(await countTaskEvents()).toBe(events + 2);

      const removed = await send('post', `/internal/v1/tasks/${task.key}/labels/remove`, camille, {
        body: { name: 'dESIGN' },
      });
      const absent = await send('post', `/internal/v1/tasks/${task.key}/labels/remove`, camille, {
        body: { name: 'Design' },
      });
      expect(conforms(RemoveTaskLabelInternalResponse, bodyOf(removed)).labels).toEqual([
        'Sécurité',
        'Securite',
      ]);
      expect(conforms(RemoveTaskLabelInternalResponse, bodyOf(absent)).version).toBe(5);
    });

    it('ignores a label of a creation that repeats another without regard to case, and refuses a twenty-first label', async () => {
      const task = await createTask(camille, produitList.id, {
        name: 'Étiqueter le backlog',
        labels: Array.from({ length: 19 }, (_, index) => `Étiquette ${String(index + 1)}`),
      });
      const repeated = await createTask(camille, produitList.id, {
        name: 'Étiqueter le sprint',
        labels: ['Design', ' design ', 'DESIGN', 'Auth'],
      });

      const twentieth = await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
        body: { name: 'Dernière' },
      });
      const over = await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
        body: { name: 'Une de trop' },
      });
      const duplicate = await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
        body: { name: 'DERNIÈRE' },
      });

      expect(repeated.labels).toEqual(['Design', 'Auth']);
      expectStatus(twentieth, 200);
      expect(conforms(AddTaskLabelInternalResponse, bodyOf(twentieth)).labels).toHaveLength(20);
      expectProblem(over, 422, 'task.label-limit-reached');
      expectStatus(duplicate, 200);
      expect(conforms(AddTaskLabelInternalResponse, bodyOf(duplicate))).toMatchObject({
        version: 2,
      });
    });

    it('ticks and unticks a checklist item, answers the same version for the same state, and counts the ticked ones', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Check-list de livraison' });
      const first = await send('post', `/internal/v1/tasks/${task.key}/checklist-items`, camille, {
        body: { text: '  Maquette validée ' },
      });
      const second = await send('post', `/internal/v1/tasks/${task.key}/checklist-items`, camille, {
        body: { text: 'Tests passés' },
      });
      const [item] = conforms(AddChecklistItemInternalResponse, bodyOf(first)).checklist;
      const after = conforms(AddChecklistItemInternalResponse, bodyOf(second));
      const path = `/internal/v1/tasks/${task.key}/checklist-items/${item?.id ?? ''}`;

      const ticked = await send('patch', path, camille, { body: { done: true } });
      const tickedAgain = await send('patch', path, camille, { body: { done: true } });
      const unticked = await send('patch', path, camille, { body: { done: false } });

      expect(after.checklist.map((entry) => entry.text)).toEqual([
        'Maquette validée',
        'Tests passés',
      ]);
      expect(after).toMatchObject({ checklistCounts: { total: 2, done: 0 }, version: 3 });
      expect(conforms(UpdateChecklistItemInternalResponse, bodyOf(ticked))).toMatchObject({
        checklistCounts: { total: 2, done: 1 },
        version: 4,
      });
      expect(conforms(UpdateChecklistItemInternalResponse, bodyOf(tickedAgain)).version).toBe(4);
      expect(tickedAgain.headers.etag).toBe('"4"');
      expect(conforms(UpdateChecklistItemInternalResponse, bodyOf(unticked))).toMatchObject({
        checklistCounts: { total: 2, done: 0 },
        version: 5,
      });
    });

    it('answers 404 checklist-item.not-found for an item that does not exist or belongs to another task', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Vérifier la recette' });
      const other = await createTask(camille, produitList.id, { name: 'Autre recette' });
      const added = await send('post', `/internal/v1/tasks/${other.key}/checklist-items`, camille, {
        body: { text: 'Étape' },
      });
      const otherItem = conforms(AddChecklistItemInternalResponse, bodyOf(added)).checklist[0]?.id;

      for (const itemId of [randomUUID(), otherItem ?? '']) {
        expectProblem(
          await send('patch', `/internal/v1/tasks/${task.key}/checklist-items/${itemId}`, camille, {
            body: { done: true },
          }),
          404,
          'checklist-item.not-found',
        );
      }
      expect(await readTask(camille, other.key)).toMatchObject({
        checklistCounts: { total: 1, done: 0 },
      });
    });

    it('refuses a hundred-and-first checklist item with 422 task.checklist-limit-reached', async () => {
      const task = await createTask(camille, produitList.id, { name: 'Check-list de la recette' });
      let latest = task;
      for (let index = 1; index <= 100; index += 1) {
        const response = await send(
          'post',
          `/internal/v1/tasks/${task.key}/checklist-items`,
          camille,
          { body: { text: `Point ${String(index)}` } },
        );
        expectStatus(response, 201);
        latest = conforms(AddChecklistItemInternalResponse, bodyOf(response));
      }

      const over = await send('post', `/internal/v1/tasks/${task.key}/checklist-items`, camille, {
        body: { text: 'Point 101' },
      });

      expect(latest.checklist).toHaveLength(100);
      expect(latest.checklist[99]?.text).toBe('Point 100');
      expectProblem(over, 422, 'task.checklist-limit-reached');
      expect(await countRows('checklist_items', `text = 'Point 101'`)).toBe(0);
    });
  });

  describe('the activity of a task lists its changes, most recent first', () => {
    it('lists create, status, assign, due and priority changes most recent first, and counts them in total', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Corriger le calendrier' });
      await patchTask(camille, task.key, { status: 'progress' });
      await assign(camille, task.key, hugo);
      await patchTask(hugo, task.key, { dueDate: '2026-11-20' });
      await patchTask(camille, task.key, { priority: 'haute' });

      const page = await activityOf(lea, task.key);

      expect(page.items.map((entry) => entry.kind)).toEqual([
        'priority',
        'due',
        'assign',
        'status',
        'create',
      ]);
      expect(page).toMatchObject({ nextCursor: null, total: 5 });
      expect(page.items.map((entry) => entry.actor.id)).toEqual([
        camille.userId,
        hugo.userId,
        camille.userId,
        camille.userId,
        camille.userId,
      ]);
      expect(page.items[0]).toMatchObject({
        priority: { from: 'moyenne', to: 'haute' },
        task: { key: task.key, name: 'Corriger le calendrier', status: 'progress' },
        listId: sprint14.id,
      });
      expect(page.items[1]).toMatchObject({ dueDate: { from: null, to: '2026-11-20' } });
      expect(page.items[2]).toMatchObject({ assignee: { userId: hugo.userId, added: true } });
      expect(page.items[3]).toMatchObject({ status: { from: 'todo', to: 'progress' } });
      const times = page.items.map((entry) => new Date(entry.occurredAt).getTime());
      expect(times).toEqual([...times].sort((left, right) => right - left));
    });

    it('keeps the kinds asked for, separated by commas or repeated, and refuses an unknown kind with 400', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Trier les anomalies' });
      await patchTask(camille, task.key, { status: 'progress' });
      await assign(camille, task.key, hugo);
      await patchTask(camille, task.key, { priority: 'basse' });

      const commas = await activityOf(camille, task.key, '?kind=status,assign');
      const repeated = await activityOf(camille, task.key, '?kind=status&kind=assign');
      const single = await activityOf(camille, task.key, '?kind=create');

      expect(commas.items.map((entry) => entry.kind)).toEqual(['assign', 'status']);
      expect(commas.total).toBe(2);
      expect(repeated).toEqual(commas);
      expect(single).toMatchObject({ total: 1 });
      expect(single.items.map((entry) => entry.kind)).toEqual(['create']);
      expectProblem(
        await send('get', `/internal/v1/tasks/${task.key}/activity?kind=comment`, camille),
        400,
        'request.invalid',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${task.key}/activity?color=blue`, camille),
        400,
        'request.invalid',
      );
    });

    it('walks every entry once with the cursor, whatever the page size, and refuses a cursor of another route', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Faire défiler l’historique' });
      for (const status of ['progress', 'review', 'testing', 'done', 'todo'] as const) {
        await patchTask(camille, task.key, { status });
      }
      const all = await activityOf(camille, task.key, '?limit=100');

      const walked: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query = `?limit=2${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
        const page: ActivityBody = await activityOf(camille, task.key, query);
        walked.push(...page.items.map((entry) => entry.id));
        expect(page.total).toBe(6);
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor !== null && pages < 10);

      expect(all.items).toHaveLength(6);
      expect(pages).toBe(3);
      expect(walked).toEqual(all.items.map((entry) => entry.id));
      const withKind = await send(
        'get',
        `/internal/v1/tasks/${task.key}/activity?limit=2`,
        camille,
      );
      const taskCursor = (bodyOf(withKind) as { nextCursor: string }).nextCursor;
      expectProblem(
        await send(
          'get',
          `/internal/v1/lists/${sprint14.id}/activity?cursor=${encodeURIComponent(taskCursor)}`,
          camille,
        ),
        400,
        'request.invalid',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${task.key}/activity?cursor=pas-un-curseur`, camille),
        400,
        'request.invalid',
      );
    });
  });

  describe('priority and due-date changes of the same actor within 60 seconds merge into one entry', () => {
    it('merges two priority changes into one entry that keeps the first value and the id, and takes the last instant', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Régler la priorité' });
      await patchTask(camille, task.key, { priority: 'haute' });
      const [first] = (await activityOf(camille, task.key, '?kind=priority')).items;

      await pause(20);
      await patchTask(camille, task.key, { priority: 'urgente' });

      const page = await activityOf(camille, task.key, '?kind=priority');
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: first?.id,
        priority: { from: 'moyenne', to: 'urgente' },
        actor: { type: 'user', id: camille.userId },
      });
      expect(new Date(page.items[0]?.occurredAt ?? 0).getTime()).toBeGreaterThan(
        new Date(first?.occurredAt ?? 0).getTime(),
      );
      expect(page.total).toBe(1);
    });

    it('deletes the entry when the merged change is back to the original value', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Annuler la priorité' });
      await patchTask(camille, task.key, { priority: 'basse' });

      const back = await patchTask(camille, task.key, { priority: 'moyenne' });

      expect(back.priority).toBe('moyenne');
      expect((await activityOf(camille, task.key, '?kind=priority')).items).toEqual([]);
      expect(await activityOf(camille, task.key)).toMatchObject({ total: 1 });
    });

    it('gives another actor an entry of their own, and the chain breaks at the change of someone else', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Arbitrer la priorité' });
      await patchTask(camille, task.key, { priority: 'haute' });
      await patchTask(ines, task.key, { priority: 'basse' });

      const afterInes = await activityOf(camille, task.key, '?kind=priority');
      await patchTask(camille, task.key, { priority: 'urgente' });
      const afterCamille = await activityOf(camille, task.key, '?kind=priority');

      expect(afterInes.items).toMatchObject([
        { actor: { id: ines.userId }, priority: { from: 'haute', to: 'basse' } },
        { actor: { id: camille.userId }, priority: { from: 'moyenne', to: 'haute' } },
      ]);
      expect(afterCamille.items).toMatchObject([
        { actor: { id: camille.userId }, priority: { from: 'basse', to: 'urgente' } },
        { actor: { id: ines.userId }, priority: { from: 'haute', to: 'basse' } },
        { actor: { id: camille.userId }, priority: { from: 'moyenne', to: 'haute' } },
      ]);
    });

    it('records a new entry once the last one is more than 60 seconds old, and still merges at 30 seconds', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Laisser passer la minute' });
      await patchTask(camille, task.key, { priority: 'haute' });

      await ageActivity(task.key, 'priority', 30);
      await patchTask(camille, task.key, { priority: 'urgente' });
      const merged = await activityOf(camille, task.key, '?kind=priority');
      await ageActivity(task.key, 'priority', 90);
      await patchTask(camille, task.key, { priority: 'basse' });
      const split = await activityOf(camille, task.key, '?kind=priority');

      expect(merged.items).toMatchObject([{ priority: { from: 'moyenne', to: 'urgente' } }]);
      expect(split.items).toMatchObject([
        { priority: { from: 'urgente', to: 'basse' } },
        { priority: { from: 'moyenne', to: 'urgente' } },
      ]);
    });

    it('merges the moves of the due date, and deletes the entry when the due date is back to none', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Négocier l’échéance' });
      await patchTask(camille, task.key, { dueDate: '2026-11-20' });
      await patchTask(camille, task.key, { dueDate: '2026-11-27' });

      const moved = await activityOf(camille, task.key, '?kind=due');
      await patchTask(camille, task.key, { dueDate: null });
      const removed = await activityOf(camille, task.key, '?kind=due');

      expect(moved.items).toMatchObject([{ dueDate: { from: null, to: '2026-11-27' } }]);
      expect(removed.items).toEqual([]);
    });

    it('keeps one entry per status change, and never merges a priority change with a due-date change', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Suivre les statuts' });
      await patchTask(camille, task.key, { status: 'progress' });
      await patchTask(camille, task.key, { status: 'review' });
      await patchTask(camille, task.key, { priority: 'haute', dueDate: '2026-11-25' });

      const page = await activityOf(camille, task.key);

      expect(page.items.map((entry) => entry.kind).sort()).toEqual([
        'create',
        'due',
        'priority',
        'status',
        'status',
      ]);
    });
  });

  describe('the activity of a list holds the entries recorded while their task was in it', () => {
    let activityList: ListBody;
    let ofCamille: TaskBody;
    let ofHugo: TaskBody;

    it('filters the entries by actor, with ids separated by commas, in lower case or not, and by kind', async () => {
      activityList = await createList(camille, produit.id, 'Rétrospective');
      ofCamille = await createTask(camille, activityList.id, { name: 'Clarifier les rôles' });
      ofHugo = await createTask(hugo, activityList.id, { name: 'Alléger la revue de code' });
      await patchTask(camille, ofCamille.key, { status: 'progress' });

      const all = await listActivityOf(lea, activityList.id);
      const byHugo = await listActivityOf(lea, activityList.id, `?actorId=${hugo.userId}`);
      const byUpper = await listActivityOf(
        lea,
        activityList.id,
        `?actorId=${hugo.userId.toUpperCase()}`,
      );
      const byBoth = await listActivityOf(
        lea,
        activityList.id,
        `?actorId=${hugo.userId},${camille.userId}`,
      );
      const byKind = await listActivityOf(lea, activityList.id, '?kind=status');
      const bySystem = await listActivityOf(lea, activityList.id, '?actorId=task-service');
      const byOther = await listActivityOf(lea, activityList.id, `?actorId=${ines.userId}`);

      expect(all.items.map((entry) => entry.kind)).toEqual(['status', 'create', 'create']);
      expect(all.total).toBe(3);
      expect(byHugo.items.map((entry) => entry.task.key)).toEqual([ofHugo.key]);
      expect(byUpper).toEqual(byHugo);
      expect(byBoth).toEqual(all);
      expect(byKind.items).toMatchObject([{ kind: 'status', task: { key: ofCamille.key } }]);
      expect(bySystem).toMatchObject({ items: [], total: 0 });
      expect(byOther).toMatchObject({ items: [], total: 0 });
      expectProblem(
        await send('get', `/internal/v1/lists/${activityList.id}/activity?actorId=`, camille),
        400,
        'request.invalid',
      );
    });

    it('walks the entries of a list with the cursor, one page after another, and counts the total of the list', async () => {
      const all = await listActivityOf(camille, activityList.id, '?limit=100');
      const walked: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query = `?limit=2${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
        const page: ActivityBody = await listActivityOf(camille, activityList.id, query);
        walked.push(...page.items.map((entry) => entry.id));
        expect(page.total).toBe(all.total);
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor !== null && pages < 10);

      expect(all.items).toHaveLength(3);
      expect(pages).toBe(2);
      expect(walked).toEqual(all.items.map((entry) => entry.id));
    });

    it('keeps the entries of a task moved to another visible list in the list where they were recorded', async () => {
      const task = await createTask(camille, activityList.id, { name: 'Documenter le processus' });
      await patchTask(camille, task.key, { listId: marketingList.id });
      await patchTask(camille, task.key, { priority: 'haute' });

      const before = await listActivityOf(
        lea,
        activityList.id,
        `?actorId=${camille.userId}&kind=create`,
      );
      const after = await listActivityOf(lea, marketingList.id, '?kind=priority');

      expect(before.items.map((entry) => entry.task.key)).toContain(task.key);
      expect(after.items.map((entry) => entry.task.key)).toContain(task.key);
      expect(
        (await listActivityOf(lea, activityList.id, '?kind=priority')).items.map(
          (entry) => entry.task.key,
        ),
      ).not.toContain(task.key);
    });

    it('leaves out of items and total the entries of a task that went to the private space of someone else, and keeps them for that person', async () => {
      const before = await listActivityOf(camille, activityList.id);

      const moved = await patchTask(hugo, ofHugo.key, { listId: rechercheList.id });

      expect(moved.spaceId).toBe(recherche.id);
      const forCamille = await listActivityOf(camille, activityList.id);
      const forLea = await listActivityOf(lea, activityList.id);
      const forHugo = await listActivityOf(hugo, activityList.id);
      expect(forCamille.items.map((entry) => entry.task.key)).not.toContain(ofHugo.key);
      expect(forLea.items.map((entry) => entry.task.key)).not.toContain(ofHugo.key);
      expect(forCamille.total).toBe(before.total - 1);
      expect(forLea.total).toBe(before.total - 1);
      expect(forHugo.items.map((entry) => entry.task.key)).toContain(ofHugo.key);
      expect(forHugo.total).toBe(before.total);
      expectProblem(
        await send('get', `/internal/v1/tasks/${ofHugo.key}/activity`, camille),
        404,
        'task.not-found',
      );
    });
  });

  describe('every change appends its events in its transaction, without what must not travel', () => {
    it('announces a creation with task.created.v1 for the task then for each subtask, and task.assigned.v1 for each assignee', async () => {
      const task = await createTask(camille, sprint14.id, {
        name: 'Annoncer la release',
        description: 'Texte long qui ne voyage pas.',
        assigneeIds: [hugo.userId, lea.userId],
        subtasks: [{ name: 'Notes de version' }, { name: 'Billet de blog' }],
      });
      const [notes, billet] = [numberedKey(task.key, 1), numberedKey(task.key, 2)];

      const rows = await outboxOfKeys(task.key, notes, billet);

      const summary = rows.map((row) => {
        const payload = row.payload as { readonly key: string; readonly assigneeId?: string };
        return [row.event_name, payload.key, payload.assigneeId ?? null];
      });
      expect(summary).toEqual([
        ['task.created.v1', task.key, null],
        ['task.assigned.v1', task.key, hugo.userId],
        ['task.assigned.v1', task.key, lea.userId],
        ['task.created.v1', notes, null],
        ['task.assigned.v1', notes, hugo.userId],
        ['task.created.v1', billet, null],
        ['task.assigned.v1', billet, hugo.userId],
      ]);
      const created = conforms(taskEventSchemas['task.created.v1'], rows[0]?.payload);
      expect(created).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: camille.userId },
        version: 1,
        key: task.key,
        parentKey: null,
        listId: sprint14.id,
        spaceId: produit.id,
        name: 'Annoncer la release',
        status: 'todo',
        priority: 'moyenne',
        assigneeIds: [hugo.userId, lea.userId],
      });
      expect(created).not.toHaveProperty('description');
      expect(created).not.toHaveProperty('checklist');
      expect(conforms(taskEventSchemas['task.assigned.v1'], rows[2]?.payload)).toMatchObject({
        assigneeId: lea.userId,
        assigneeIds: [hugo.userId, lea.userId],
        version: 1,
      });
      expect(conforms(taskEventSchemas['task.created.v1'], rows[3]?.payload)).toMatchObject({
        parentKey: task.key,
        assigneeIds: [hugo.userId],
        status: 'todo',
        priority: 'moyenne',
      });
    });

    it('announces a change of status with task.updated.v1 then task.status-changed.v1 at the same version', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Publier la release' });

      await patchTask(hugo, task.key, { status: 'progress', priority: 'haute' });

      const [, updatedRow, statusRow] = await outboxOfKeys(task.key);
      expect(updatedRow?.event_name).toBe('task.updated.v1');
      expect(statusRow?.event_name).toBe('task.status-changed.v1');
      const updated = conforms(taskEventSchemas['task.updated.v1'], updatedRow?.payload);
      const changed = conforms(taskEventSchemas['task.status-changed.v1'], statusRow?.payload);
      expect(updated).toMatchObject({
        actor: { type: 'user', id: hugo.userId },
        version: 2,
        status: 'progress',
        priority: 'haute',
      });
      expect([...updated.changed].sort()).toEqual(['priority', 'status']);
      expect(changed).toMatchObject({
        actor: { type: 'user', id: hugo.userId },
        version: 2,
        previousStatus: 'todo',
        status: 'progress',
        cancelReason: null,
        cancelNote: null,
      });
    });

    it('never lets a description or a checklist travel, and a cancel note only in task.status-changed.v1', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Clore le chantier SSO' });

      await patchTask(camille, task.key, { description: 'Notes internes.' }, { 'If-Match': '*' });
      await send('post', `/internal/v1/tasks/${task.key}/checklist-items`, camille, {
        body: { text: 'Archiver les maquettes' },
      });
      await patchTask(camille, task.key, {
        status: 'cancelled',
        cancelReason: 'scope',
        cancelNote: 'Hors périmètre du trimestre',
      });

      const rows = await outboxOfKeys(task.key);
      const updates = rows
        .filter((row) => row.event_name === 'task.updated.v1')
        .map((row) => conforms(taskEventSchemas['task.updated.v1'], row.payload));
      const [statusRow] = rows.filter((row) => row.event_name === 'task.status-changed.v1');
      expect(updates.map((update) => update.changed)).toEqual([
        ['description'],
        ['checklist'],
        expect.arrayContaining(['status', 'cancelReason', 'cancelNote']) as string[],
      ]);
      for (const row of rows) {
        expect(row.payload).not.toHaveProperty('description');
        expect(row.payload).not.toHaveProperty('checklist');
        if (row.event_name !== 'task.status-changed.v1') {
          expect(row.payload).not.toHaveProperty('cancelNote');
        }
      }
      expect(
        conforms(taskEventSchemas['task.status-changed.v1'], statusRow?.payload),
      ).toMatchObject({
        cancelReason: 'scope',
        cancelNote: 'Hors périmètre du trimestre',
        previousStatus: 'todo',
        status: 'cancelled',
        version: 4,
      });
    });

    it('announces an assignment with task.updated.v1 then task.assigned.v1 at the same version, and a removal with task.updated.v1 alone', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Réserver la salle' });

      await assign(camille, task.key, lea);
      await send('delete', `/internal/v1/tasks/${task.key}/assignees/${lea.userId}`, camille);

      const rows = await outboxOfKeys(task.key);
      expect(rows.map((row) => row.event_name)).toEqual([
        'task.created.v1',
        'task.updated.v1',
        'task.assigned.v1',
        'task.updated.v1',
      ]);
      const [, updated, assigned, removed] = rows.map(
        (row) => row.payload as { version: number; changed?: string[] },
      );
      expect(updated).toMatchObject({ version: 2, changed: ['assigneeIds'] });
      expect(assigned).toMatchObject({ version: 2, assigneeId: lea.userId });
      expect(removed).toMatchObject({ version: 3, changed: ['assigneeIds'], assigneeIds: [] });
    });

    it('lets the relay publish every row of the change', async () => {
      const task = await createTask(camille, sprint14.id, {
        name: 'Surveiller le relais',
        assigneeIds: [hugo.userId],
      });

      await vi.waitFor(async () => {
        const rows = await outboxOfKeys(task.key);
        expect(rows.map((row) => [row.event_name, row.status])).toEqual([
          ['task.created.v1', 'sent'],
          ['task.assigned.v1', 'sent'],
        ]);
      }, waitOptions);
    });
  });

  describe('the same Idempotency-Key replays the creation instead of creating again', () => {
    it('replays a task creation with its Location, the ETag of version 1 and the first body, and creates one task and one set of keys', async () => {
      const body = {
        name: 'Préparer la démo du Sprint 14',
        subtasks: [
          { name: 'Jeu de données du Sprint 14' },
          { name: 'Script de démo du Sprint 14' },
        ],
      };
      const headers = { 'Idempotency-Key': 'creer-demo-sprint-14' };

      const first = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
        body,
        headers,
      });
      const created = conforms(CreateTaskInternalResponse, bodyOf(first));
      await patchTask(camille, created.key, { priority: 'haute' });
      const again = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
        body,
        headers,
      });
      const next = await createTask(camille, sprint14.id, { name: 'Dérouler la démo' });

      expectStatus(first, 201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expectStatus(again, 201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(again.headers.location).toBe(`/internal/v1/tasks/${created.key}`);
      expect(again.headers.etag).toBe('"1"');
      expect(bodyOf(again)).toEqual(bodyOf(first));
      conforms(CreateTaskInternalResponse, bodyOf(again));
      expect(await countRows('tasks', `name = 'Préparer la démo du Sprint 14'`)).toBe(1);
      expect(
        await countRows(
          'tasks',
          `name in ('Jeu de données du Sprint 14', 'Script de démo du Sprint 14')`,
        ),
      ).toBe(2);
      expect(numberOf(next.key)).toBe(numberOf(created.key) + 3);
      expect(await readTask(camille, created.key)).toMatchObject({ version: 2 });
    });

    it('refuses the same key with another body with 422 idempotency.key-reused, and creates nothing', async () => {
      const response = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
        body: { name: 'Préparer la démo du Sprint 15' },
        headers: { 'Idempotency-Key': 'creer-demo-sprint-14' },
      });

      expectProblem(response, 422, 'idempotency.key-reused');
      expect(await countRows('tasks', `name = 'Préparer la démo du Sprint 15'`)).toBe(0);
    });

    it('refuses a malformed key with 400 request.invalid and one issue on the header, on the three creations', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Tenir la démo' });
      const before = await countRows('tasks', 'true');

      const created = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
        body: { name: 'Jamais créée' },
        headers: { 'Idempotency-Key': 'creer demo 1' },
      });
      const subtask = await send('post', `/internal/v1/tasks/${task.key}/subtasks`, camille, {
        body: { name: 'Jamais créée' },
        headers: { 'Idempotency-Key': 'créer-démo' },
      });
      const item = await send('post', `/internal/v1/tasks/${task.key}/checklist-items`, camille, {
        body: { text: 'Jamais créé' },
        headers: { 'Idempotency-Key': 'x'.repeat(256) },
      });

      for (const response of [created, subtask, item]) {
        expectProblem(response, 400, 'request.invalid');
        expect(bodyOf(response)).toMatchObject({
          details: { issues: [{ in: 'header', path: 'Idempotency-Key', code: 'invalid_format' }] },
        });
      }
      expect(await countRows('tasks', 'true')).toBe(before);
      expect(await readTask(camille, task.key)).toMatchObject({ version: 1 });
    });

    it('replays a subtask creation and a checklist item creation, and creates one of each', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Animer la démo' });

      const subtaskCall = (): Promise<request.Response> =>
        send('post', `/internal/v1/tasks/${task.key}/subtasks`, camille, {
          body: { name: 'Accueillir le public' },
          headers: { 'Idempotency-Key': 'sous-tache-accueil' },
        });
      const itemCall = (): Promise<request.Response> =>
        send('post', `/internal/v1/tasks/${task.key}/checklist-items`, camille, {
          body: { text: 'Brancher le projecteur' },
          headers: { 'Idempotency-Key': 'checklist-projecteur' },
        });
      const subtask = await subtaskCall();
      const subtaskAgain = await subtaskCall();
      const item = await itemCall();
      const itemAgain = await itemCall();

      expectStatus(subtask, 201);
      expectStatus(subtaskAgain, 201);
      expect(subtaskAgain.headers['idempotent-replayed']).toBe('true');
      expect(subtaskAgain.headers.location).toBe(subtask.headers.location);
      expect(subtaskAgain.headers.etag).toBe('"1"');
      expect(bodyOf(subtaskAgain)).toEqual(bodyOf(subtask));
      expectStatus(item, 201);
      expectStatus(itemAgain, 201);
      expect(itemAgain.headers['idempotent-replayed']).toBe('true');
      expect(itemAgain.headers.location).toBe(item.headers.location);
      expect(itemAgain.headers.etag).toBe(item.headers.etag);
      expect(bodyOf(itemAgain)).toEqual(bodyOf(item));
      conforms(CreateSubtaskInternalResponse, bodyOf(subtaskAgain));
      conforms(AddChecklistItemInternalResponse, bodyOf(itemAgain));
      expect(await countRows('tasks', `name = 'Accueillir le public'`)).toBe(1);
      expect(await countRows('checklist_items', `text = 'Brancher le projecteur'`)).toBe(1);
      expect(await readTask(camille, task.key)).toMatchObject({
        subtaskCounts: { total: 1, closed: 0 },
        checklistCounts: { total: 1, done: 0 },
        version: 2,
      });
    });
  });

  describe('organizations never see each other', () => {
    let delta: TaskBody;

    it('serves each organization its own tasks, and lets both use the prefix CAD and the numbers of the other', async () => {
      const boutique = await createSpace(
        solene,
        { name: 'Boutique', prefix: 'CAD' },
        atelierDeltaId,
      );
      delta = await createTask(
        solene,
        boutique.firstList.id,
        {
          name: 'Ouvrir la boutique',
          assigneeIds: [solene.userId],
          labels: ['Lancement'],
        },
        atelierDeltaId,
      );
      const item = await send('post', `/internal/v1/tasks/${delta.key}/checklist-items`, solene, {
        body: { text: 'Choisir le nom' },
        organizationId: atelierDeltaId,
      });
      expectStatus(item, 201);

      expect(delta.key).toBe('CAD-1');
      expectProblem(
        await send('get', '/internal/v1/tasks/CAD-482', solene, { organizationId: atelierDeltaId }),
        404,
        'task.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${delta.key}/activity`, camille),
        404,
        'task.not-found',
      );
      expectProblem(await send('get', '/internal/v1/tasks/CAD-1', camille), 404, 'task.not-found');
      expectProblem(
        await send('get', `/internal/v1/lists/${sprint14.id}/activity`, solene, {
          organizationId: atelierDeltaId,
        }),
        404,
        'list.not-found',
      );
      expectProblem(
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, solene, {
          body: { name: 'Intrus' },
          organizationId: atelierDeltaId,
        }),
        404,
        'list.not-found',
      );
    });

    it('shows the second organization none of the rows of Atelier Nord in the five tables of the tasks', async () => {
      const tables = [
        'tasks',
        'task_assignees',
        'task_labels',
        'checklist_items',
        'activity_entries',
      ] as const;
      const organizationsSeen = async (table: string): Promise<readonly string[]> =>
        inTenant(atelierDeltaId, async (client) => {
          const result = await client.query(
            `select distinct organization_id::text as organization_id from ${table}`,
          );
          return (result.rows as readonly { readonly organization_id: string }[]).map(
            (row) => row.organization_id,
          );
        });

      for (const table of tables) {
        expect(await organizationsSeen(table), table).toEqual([atelierDeltaId]);
        const own = await inTenant(atelierDeltaId, async (client) => {
          const result = await client.query(
            `select count(*)::int as total from ${table} where organization_id = $1`,
            [atelierNordId],
          );
          return result.rows as readonly { readonly total: number }[];
        });
        expect(own, table).toEqual([{ total: 0 }]);
      }
    });

    it('refuses with 42501 a row of Atelier Nord written from a tenant transaction of the second organization, in each of the five tables', async () => {
      const [row] = await asSystem<{ readonly id: string; readonly list_id: string }>(
        `select id, list_id from tasks where organization_id = $1 and key_prefix = 'CAD' and key_number = 482`,
        [atelierNordId],
      );
      const taskId = row?.id ?? '';
      const listId = row?.list_id ?? '';
      const writes: readonly {
        readonly table: string;
        readonly sql: string;
        readonly params: unknown[];
      }[] = [
        {
          table: 'tasks',
          sql: `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status, priority, created_by_type, created_by_id)
                values ($1, $2, $3, 'INT', 1, 'Intrue', 'todo', 'moyenne', 'user', $4)`,
          params: [atelierNordId, produit.id, listId, solene.userId],
        },
        {
          table: 'task_assignees',
          sql: `insert into task_assignees (organization_id, task_id, user_id, position) values ($1, $2, $3, 9)`,
          params: [atelierNordId, taskId, solene.userId],
        },
        {
          table: 'task_labels',
          sql: `insert into task_labels (organization_id, task_id, label_key, name, position) values ($1, $2, 'intrus', 'Intrus', 9)`,
          params: [atelierNordId, taskId],
        },
        {
          table: 'checklist_items',
          sql: `insert into checklist_items (organization_id, task_id, text, position) values ($1, $2, 'Intrus', 99)`,
          params: [atelierNordId, taskId],
        },
        {
          table: 'activity_entries',
          sql: `insert into activity_entries (organization_id, task_id, list_id, kind, actor_type, actor_id, occurred_at)
                values ($1, $2, $3, 'create', 'user', $4, now())`,
          params: [atelierNordId, taskId, listId, solene.userId],
        },
      ];

      for (const write of writes) {
        await expect(
          inTenant(atelierDeltaId, (client) => client.query(write.sql, write.params)),
          write.table,
        ).rejects.toMatchObject({ code: '42501' });
      }
      expect(await countRows('tasks', `key_prefix = 'INT'`)).toBe(0);
      expect(
        await countRows('task_assignees', `user_id = $2 and position = 9`, solene.userId),
      ).toBe(0);
      expect(await countRows('task_labels', `label_key = 'intrus'`)).toBe(0);
      expect(await countRows('checklist_items', `text = 'Intrus'`)).toBe(0);
    });
  });

  describe('keys are given one at a time, and a creation that fails gives none away', () => {
    let counter: SpaceBody;
    let counterList: ListBody;

    /**
     * Reads the last number given for the prefix CNC.
     *
     * @returns The last number.
     */
    async function lastNumber(): Promise<number> {
      const rows = await asSystem<{ readonly last_number: number }>(
        `select last_number::int as last_number from space_prefixes where organization_id = $1 and prefix = 'CNC'`,
        [atelierNordId],
      );
      return rows[0]?.last_number ?? -1;
    }

    it('gives six simultaneous creations six distinct consecutive keys', async () => {
      const created = await createSpace(camille, { name: 'Concurrence', prefix: 'CNC' });
      counter = created.space;
      counterList = created.firstList;
      const actors = [camille, ines, hugo, lea, camille, ines];

      const responses = await Promise.all(
        actors.map((actor, index) =>
          send('post', `/internal/v1/lists/${counterList.id}/tasks`, actor, {
            body: { name: `Création simultanée ${String(index + 1)}` },
          }),
        ),
      );

      const keys = responses.map((response) => {
        expectStatus(response, 201);
        return conforms(CreateTaskInternalResponse, bodyOf(response)).key;
      });
      expect(keys.map(numberOf).sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(keys).size).toBe(6);
      expect(await lastNumber()).toBe(6);
      expect(counter.prefix).toBe('CNC');
    });

    it('keeps the block of a task and its subtasks together when creations with subtasks run at the same time', async () => {
      const responses = await Promise.all(
        [camille, ines, hugo].map((actor, index) =>
          send('post', `/internal/v1/lists/${counterList.id}/tasks`, actor, {
            body: {
              name: `Création en bloc ${String(index + 1)}`,
              subtasks: [
                { name: `Sous-tâche ${String(index + 1)}.1` },
                { name: `Sous-tâche ${String(index + 1)}.2` },
              ],
            },
          }),
        ),
      );

      const tasks = responses.map((response) => {
        expectStatus(response, 201);
        return conforms(CreateTaskInternalResponse, bodyOf(response));
      });
      const starts = tasks.map((task) => numberOf(task.key)).sort((left, right) => left - right);
      expect(starts).toEqual([7, 10, 13]);
      for (const task of tasks) {
        const page = await send('get', `/internal/v1/tasks/${task.key}/subtasks`, camille);
        expect(
          conforms(ListSubtasksInternalResponse, bodyOf(page)).items.map((item) =>
            numberOf(item.key),
          ),
        ).toEqual([numberOf(task.key) + 1, numberOf(task.key) + 2]);
      }
      expect(await lastNumber()).toBe(15);
    });

    it('gives no key away when a creation fails after the allocation, with its subtasks or without', async () => {
      const before = await lastNumber();
      await migrator.query(
        `alter table tasks add constraint tasks_test_fault check (name <> 'Échec programmé') not valid`,
      );
      let failed: request.Response;
      let failedWithSubtasks: request.Response;
      try {
        failed = await send('post', `/internal/v1/lists/${counterList.id}/tasks`, camille, {
          body: { name: 'Échec programmé' },
        });
        failedWithSubtasks = await send(
          'post',
          `/internal/v1/lists/${counterList.id}/tasks`,
          camille,
          {
            body: {
              name: 'Création qui échoue plus loin',
              subtasks: [{ name: 'Première' }, { name: 'Échec programmé' }],
            },
          },
        );
      } finally {
        await migrator.query('alter table tasks drop constraint if exists tasks_test_fault');
      }

      expect(failed.status).toBe(500);
      expect(failedWithSubtasks.status).toBe(500);
      expect(await lastNumber()).toBe(before);
      expect(
        await countRows(
          'tasks',
          `name in ('Échec programmé', 'Création qui échoue plus loin', 'Première')`,
        ),
      ).toBe(0);
      const next = await createTask(camille, counterList.id, { name: 'Création qui réussit' });
      expect(numberOf(next.key)).toBe(before + 1);
      expect(await lastNumber()).toBe(before + 1);
    });
  });

  describe('values the database cannot store are refused at the boundary', () => {
    it('refuses U+0000 in a name, a description, a label, a subtask name and a checklist text with 400 request.invalid, and writes nothing', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Nettoyer les saisies' });
      const before = await countRows('tasks', 'true');
      const events = await countTaskEvents();

      const calls = [
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
          body: { name: 'Tâche\u0000cachée' },
        }),
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
          body: { name: 'Tâche', description: 'Texte\u0000caché' },
        }),
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
          body: { name: 'Tâche', labels: ['Étiquette\u0000'] },
        }),
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
          body: { name: 'Tâche', subtasks: [{ name: 'Sous\u0000tâche' }] },
        }),
        await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
          body: { name: 'Nom\u0000caché' },
        }),
        await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
          body: { description: 'Texte\u0000caché' },
          headers: { 'If-Match': '*' },
        }),
        await send('post', `/internal/v1/tasks/${task.key}/subtasks`, camille, {
          body: { name: 'Sous\u0000tâche' },
        }),
        await send('post', `/internal/v1/tasks/${task.key}/labels/add`, camille, {
          body: { name: 'Étiquette\u0000' },
        }),
        await send('post', `/internal/v1/tasks/${task.key}/checklist-items`, camille, {
          body: { text: 'Point\u0000caché' },
        }),
      ];

      for (const response of calls) {
        expectProblem(response, 400, 'request.invalid');
      }
      expect(await countRows('tasks', 'true')).toBe(before);
      expect(await countTaskEvents()).toBe(events);
      expect(await readTask(camille, task.key)).toMatchObject({ version: 1 });
    });

    it('refuses a due date or a start date in the year 0000 with 400 request.invalid, on creation and on change', async () => {
      const task = await createTask(camille, sprint14.id, { name: 'Dater les jalons' });
      const before = await countRows('tasks', 'true');

      const calls = [
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
          body: { name: 'Tâche antique', dueDate: '0000-06-01' },
        }),
        await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, camille, {
          body: { name: 'Tâche antique', dueDate: '2026-06-01', startDate: '0000-01-01' },
        }),
        await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
          body: { dueDate: '0000-12-31' },
        }),
        await send('patch', `/internal/v1/tasks/${task.key}`, camille, {
          body: { dueDate: '2026-06-01', startDate: '0000-01-01' },
        }),
        await send('post', `/internal/v1/tasks/${task.key}/subtasks`, camille, {
          body: { name: 'Sous-tâche antique', dueDate: '0000-06-01' },
        }),
      ];

      for (const response of calls) {
        expectProblem(response, 400, 'request.invalid');
      }
      expect(await countRows('tasks', 'true')).toBe(before);
      expect(await readTask(camille, task.key)).toMatchObject({ dueDate: null, version: 1 });
    });
  });

  describe('the ids of the token are read in lower case', () => {
    it('treats an actor in upper case as Camille of Atelier Nord, who creates, reads and assigns, and signs her changes in lower case', async () => {
      const upper = { userId: camille.userId.toUpperCase() };

      const created = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, upper, {
        body: { name: 'Écrire en majuscules', assigneeIds: [hugo.userId] },
      });
      expectStatus(created, 201);
      const task = conforms(CreateTaskInternalResponse, bodyOf(created));
      const assigned = await send(
        'put',
        `/internal/v1/tasks/${task.key}/assignees/${lea.userId}`,
        upper,
        { body: {} },
      );
      const detail = await send('get', `/internal/v1/tasks/${task.key}/detail`, {
        userId: hugo.userId.toUpperCase(),
      });

      expect(task.createdBy).toEqual({ type: 'user', id: camille.userId });
      expectStatus(assigned, 200);
      expect(conforms(AssignTaskInternalResponse, bodyOf(assigned)).assignees).toEqual([
        { userId: hugo.userId },
        { userId: lea.userId },
      ]);
      expectStatus(detail, 200);
      const [entry] = (await activityOf(camille, task.key, '?kind=assign')).items;
      expect(entry).toMatchObject({ actor: { type: 'user', id: camille.userId } });
      const [createdEvent] = await outboxOfKeys(task.key);
      expect(createdEvent?.payload).toMatchObject({ actor: { type: 'user', id: camille.userId } });
    });

    it('reads an organization in upper case as Atelier Nord on the routes that read', async () => {
      const upper = { userId: camille.userId.toUpperCase() };
      const options = { organizationId: atelierNordId.toUpperCase() };

      const read = await send('get', '/internal/v1/tasks/CAD-482', upper, options);
      const activity = await send(
        'get',
        `/internal/v1/lists/${sprint14.id}/activity`,
        upper,
        options,
      );

      expectStatus(read, 200);
      expectStatus(activity, 200);
    });

    // Defect: the token keeps the organization id as sent, and the tenant transaction compares it
    // with the lower-case id of the event: OutboxWriter.append throws and the creation answers 500.
    it.fails(
      'creates a task for an organization in upper case, as the same Atelier Nord',
      async () => {
        const upper = { userId: camille.userId.toUpperCase() };

        const created = await send('post', `/internal/v1/lists/${sprint14.id}/tasks`, upper, {
          organizationId: atelierNordId.toUpperCase(),
          body: { name: 'Écrire en majuscules partout' },
        });

        expectStatus(created, 201);
        expect(conforms(CreateTaskInternalResponse, bodyOf(created)).createdBy).toEqual({
          type: 'user',
          id: camille.userId,
        });
      },
    );

    it('sees the private space of its owner through an actor id in upper case', async () => {
      const task = await createTask(hugo, rechercheList.id, { name: 'Notes d’entretien' });

      const read = await send('get', `/internal/v1/tasks/${task.key}`, {
        userId: hugo.userId.toUpperCase(),
      });

      expectStatus(read, 200);
      expectProblem(
        await send('get', `/internal/v1/tasks/${task.key}`, {
          userId: camille.userId.toUpperCase(),
        }),
        404,
        'task.not-found',
      );
    });

    it('refuses an actor id that is not a UUID with 403 auth.actor-not-allowed', async () => {
      const response = await send('get', '/internal/v1/tasks/CAD-482', {
        userId: 'camille-martin',
      });

      expectProblem(response, 403, 'auth.actor-not-allowed');
    });
  });

  /**
   * Counts how many times an event is recorded as processed by the consumer of the removals.
   *
   * @param eventId - Id of the event.
   * @returns The number of records.
   */
  async function processedCount(eventId: string): Promise<number> {
    const rows = await asSystem<{ readonly total: number }>(
      `select count(*)::int as total from processed_events
        where consumer = 'task-service__project-member-removed' and event_id = $1`,
      [eventId],
    );
    return rows[0]?.total ?? 0;
  }

  describe('when a member leaves, they are unassigned from every task in the transaction of the removal', () => {
    it('removes Mathis from every task, closed ones and private ones included, with an assign entry and a task.updated.v1 by the system for each', async () => {
      const carnet = (
        await createSpace(mathis, {
          name: 'Carnet de Mathis',
          prefix: 'CDM',
          visibility: 'private',
        })
      ).space;
      const open = await createTask(camille, produitList.id, {
        name: 'Auditer le tunnel d’achat',
        assigneeIds: [mathis.userId, camille.userId],
      });
      const closed = await createTask(camille, produitList.id, {
        name: 'Livrer le rapport d’audit',
        assigneeIds: [mathis.userId],
      });
      const closedAtDone = await patchTask(camille, closed.key, { status: 'done' });
      const inPrivate = await createTask(camille, directionList.id, {
        name: 'Préparer le comité de direction',
        assigneeIds: [hugo.userId, mathis.userId],
      });
      const untouched = await createTask(camille, produitList.id, {
        name: 'Tâche sans Mathis',
        assigneeIds: [camille.userId],
      });
      const eventsBefore = await countTaskEvents();
      const removal = toPublishedEvent('removed', atelierNordId, mathis, 'member', 2);

      await deliver(removal);

      expect(await processedCount(removal.id)).toBe(1);
      expect(await countRows('task_assignees', 'user_id = $2', mathis.userId)).toBe(0);
      const expected: readonly (readonly [TaskBody, readonly string[]])[] = [
        [open, [camille.userId]],
        [closedAtDone, []],
        [inPrivate, [hugo.userId]],
      ];
      for (const [before, assignees] of expected) {
        const after = await readTask(camille, before.key);
        expect(after.assignees.map((person) => person.userId)).toEqual(assignees);
        expect(after.version).toBe(before.version + 1);
        expect(after.completedAt).toBe(before.completedAt);

        const [entry] = (await activityOf(camille, before.key, '?kind=assign')).items;
        expect(entry).toMatchObject({
          actor: { type: 'system', id: 'task-service' },
          assignee: { userId: mathis.userId, added: false },
          listId: before.listId,
          task: { key: before.key },
        });
        const rows = await outboxOfKeys(before.key);
        const last = rows.at(-1);
        expect(last?.event_name).toBe('task.updated.v1');
        expect(conforms(taskEventSchemas['task.updated.v1'], last?.payload)).toMatchObject({
          actor: { type: 'system', id: 'task-service' },
          changed: ['assigneeIds'],
          assigneeIds: assignees,
          version: before.version + 1,
        });
        expect(rows.filter((row) => row.event_name === 'task.assigned.v1').length).toBe(
          before.assignees.length,
        );
      }
      expect(await countTaskEvents()).toBe(eventsBefore + 3);
      expect(await readTask(camille, untouched.key)).toEqual(untouched);
      expect((await outboxOfKeys(untouched.key)).map((row) => row.event_name)).toEqual([
        'task.created.v1',
        'task.assigned.v1',
      ]);
      const handed = await send('get', `/internal/v1/spaces/${carnet.id}`, camille);
      expectStatus(handed, 200);
      expect((bodyOf(handed) as { owner: { userId: string } }).owner.userId).toBe(camille.userId);
      expectProblem(
        await send('get', '/internal/v1/tasks/CAD-482', mathis),
        404,
        'organization.not-found',
      );
    });

    it('does nothing for a second removal of the same account', async () => {
      const [task] = await asSystem<{ readonly version: number }>(
        `select version from tasks where organization_id = $1 and name = 'Auditer le tunnel d’achat'`,
        [atelierNordId],
      );
      const events = await countTaskEvents();
      const entries = await countRows('activity_entries', 'true');
      const again = toPublishedEvent('removed', atelierNordId, mathis, 'member', 2);

      await deliver(again);

      expect(await processedCount(again.id)).toBe(1);
      expect(await countTaskEvents()).toBe(events);
      expect(await countRows('activity_entries', 'true')).toBe(entries);
      const [after] = await asSystem<{ readonly version: number }>(
        `select version from tasks where organization_id = $1 and name = 'Auditer le tunnel d’achat'`,
        [atelierNordId],
      );
      expect(after?.version).toBe(task?.version);
    });

    it('unassigns nothing while the copy still holds the account as a member under another membership, then everything once that one ends', async () => {
      const task = await createTask(camille, produitList.id, {
        name: 'Rédiger les conditions générales',
        assigneeIds: [chloe.userId, camille.userId],
      });
      await deliver(
        toPublishedEvent(
          'joined',
          atelierNordId,
          { userId: chloe.userId, memberId: chloeNewMemberId },
          'member',
          1,
        ),
      );
      const events = await countTaskEvents();
      const entries = await countRows('activity_entries', 'true');

      const oldRemoval = toPublishedEvent('removed', atelierNordId, chloe, 'member', 2);
      await deliver(oldRemoval);

      expect(await processedCount(oldRemoval.id)).toBe(1);
      expect(await readTask(camille, task.key)).toEqual(task);
      expect(await countTaskEvents()).toBe(events);
      expect(await countRows('activity_entries', 'true')).toBe(entries);

      const newRemoval = toPublishedEvent(
        'removed',
        atelierNordId,
        { userId: chloe.userId, memberId: chloeNewMemberId },
        'member',
        2,
      );
      await deliver(newRemoval);

      expect(await readTask(camille, task.key)).toMatchObject({
        assignees: [{ userId: camille.userId }],
        version: 2,
      });
      expect(await countTaskEvents()).toBe(events + 1);
    });
  });

  describe('a removal that unassigns a thousand tasks commits on its first delivery', () => {
    it('unassigns Théo from 1,000 tasks in one delivery, with 1,000 entries and 1,000 task.updated.v1, within the budget of the handler', async () => {
      const bulk = await createSpace(camille, { name: 'Import massif', prefix: 'BLK' });
      await asSystem(
        `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status, priority, created_by_type, created_by_id)
         select $1, $2, $3, 'BLK', number, 'Tâche importée ' || number, 'todo', 'moyenne', 'user', $4
           from generate_series(1, 1000) as number`,
        [atelierNordId, bulk.space.id, bulk.firstList.id, camille.userId],
      );
      await asSystem(
        `insert into task_assignees (organization_id, task_id, user_id, position)
         select organization_id, id, $2, 0 from tasks
          where organization_id = $1 and key_prefix = 'BLK'`,
        [atelierNordId, theo.userId],
      );
      await asSystem(
        `update space_prefixes set last_number = 1000 where organization_id = $1 and prefix = 'BLK'`,
        [atelierNordId],
      );
      expect(await readTask(camille, 'BLK-1000')).toMatchObject({
        assignees: [{ userId: theo.userId }],
        version: 1,
      });
      const removal = toPublishedEvent('removed', atelierNordId, theo, 'member', 2);
      const redeliveredBefore = consumerInfo('project-member-removed').num_redelivered;

      publish(removal);
      const startedAt = performance.now();
      await vi.waitFor(
        async () => {
          expect(await processedCount(removal.id)).toBe(1);
        },
        { timeout: 60_000, interval: 25 },
      );
      const durationMs = performance.now() - startedAt;
      await vi.waitFor(() => {
        const info = consumerInfo('project-member-removed');
        expect(info.num_ack_pending).toBe(0);
        expect(info.num_pending).toBe(0);
        expect(info.num_redelivered).toBe(redeliveredBefore);
      }, waitOptions);

      console.info(
        `Removal of a member assigned to 1,000 tasks: committed on its first delivery in ${String(Math.round(durationMs))} ms.`,
      );
      expect(durationMs).toBeLessThan(handlerBudgetMs);
      const [state] = await asSystem<{
        readonly assignments: number;
        readonly versioned: number;
        readonly entries: number;
        readonly events: number;
      }>(
        `select
           (select count(*)::int from task_assignees where organization_id = $1 and user_id = $2) as assignments,
           (select count(*)::int from tasks where organization_id = $1 and key_prefix = 'BLK' and version = 2) as versioned,
           (select count(*)::int from activity_entries
             where organization_id = $1 and kind = 'assign' and assignee_user_id = $2
               and assignee_added = false and actor_type = 'system' and actor_id = 'task-service') as entries,
           (select count(*)::int from outbox_events
             where organization_id = $1 and event_name = 'task.updated.v1'
               and payload -> 'actor' ->> 'type' = 'system' and payload ->> 'key' like 'BLK-%') as events`,
        [atelierNordId, theo.userId],
      );
      expect(state).toEqual({ assignments: 0, versioned: 1000, entries: 1000, events: 1000 });
      expect(await readTask(camille, 'BLK-1')).toMatchObject({ assignees: [], version: 2 });
    });
  });

  describe('every event the tasks appended is valid and leaves out what must not travel', () => {
    it('parses each task.* outbox row with its schema, keeps descriptions, checklists and cancel notes out, and has the relay publish them all', async () => {
      await vi.waitFor(
        async () => {
          const pending = await asSystem<{ readonly total: number }>(
            `select count(*)::int as total from outbox_events where event_name like 'task.%' and status <> 'sent'`,
          );
          expect(pending[0]?.total).toBe(0);
        },
        { timeout: 90_000, interval: 500 },
      );

      const rows = await asSystem<OutboxRow>(
        `select event_name, status, payload from outbox_events where event_name like 'task.%' order by id`,
      );

      const names = new Set(rows.map((row) => row.event_name));
      expect([...names].sort()).toEqual([
        'task.assigned.v1',
        'task.created.v1',
        'task.status-changed.v1',
        'task.updated.v1',
      ]);
      for (const row of rows) {
        const schema = taskEventSchemas[row.event_name as keyof typeof taskEventSchemas];
        conforms(schema, row.payload);
        expect(row.payload).not.toHaveProperty('description');
        expect(row.payload).not.toHaveProperty('checklist');
        if (row.event_name !== 'task.status-changed.v1') {
          expect(row.payload).not.toHaveProperty('cancelNote');
        }
      }
    });
  });

  // Last: the removal of this test fails on a lock and is delivered again, so its consumer keeps
  // one message waiting until the lock is released, which no later `deliver` may wait on.
  describe('a removal that fails on a transient error is applied again, whole, with its unassignments', () => {
    it('keeps the member, the assignments and no processed id while a lock holds a task, then applies the removal and the unassignments together', async () => {
      const held = await createTask(camille, produitList.id, {
        name: 'Rédiger le guide d’accueil',
        assigneeIds: [noe.userId, camille.userId],
      });
      const other = await createTask(camille, produitList.id, {
        name: 'Accueillir les nouveaux',
        assigneeIds: [noe.userId],
      });
      const removal = toPublishedEvent('removed', atelierNordId, noe, 'member', 2);
      const [prefix, number] = held.key.split('-');
      const blocker = await migrator.connect();
      let holding = false;

      /**
       * Reads, in one snapshot, what the database holds of the removal and of the assignments.
       *
       * @returns Whether the membership ended, the assignments left, the entries and the events.
       */
      const removalState = async (): Promise<{
        readonly ended: boolean;
        readonly assignments: number;
        readonly entries: number;
        readonly events: number;
        readonly processed: number;
      }> => {
        const [row] = await asSystem<{
          readonly ended: boolean;
          readonly assignments: number;
          readonly entries: number;
          readonly events: number;
          readonly processed: number;
        }>(
          `select
             (select removed_at is not null from organization_members
               where organization_id = $1 and id = $2) as ended,
             (select count(*)::int from task_assignees where organization_id = $1 and user_id = $3) as assignments,
             (select count(*)::int from activity_entries
               where organization_id = $1 and kind = 'assign' and assignee_user_id = $3
                 and assignee_added = false) as entries,
             (select count(*)::int from outbox_events
               where organization_id = $1 and event_name = 'task.updated.v1'
                 and payload -> 'actor' ->> 'type' = 'system' and payload ->> 'key' = any($4::text[])) as events,
             (select count(*)::int from processed_events
               where consumer = 'task-service__project-member-removed' and event_id = $5) as processed`,
          [atelierNordId, noe.memberId, noe.userId, [held.key, other.key], removal.id],
        );
        if (row === undefined) {
          throw new Error('The state of the removal could not be read.');
        }
        return row;
      };

      try {
        // The row of a task of Noé is held, as a concurrent change would hold it, for longer than
        // the lock timeout of the application role (5 s).
        await blocker.query('begin');
        holding = true;
        await blocker.query(`select set_config('app.system_access', 'on', true)`);
        await blocker.query(
          `select 1 from tasks where organization_id = $1 and key_prefix = $2 and key_number = $3::int for update`,
          [atelierNordId, prefix, number],
        );
        const before = consumerInfo('project-member-removed');

        publish(removal);

        // The unassignment waits for the lock until the application role gives up (lock_timeout),
        // the whole unit rolls back, and the removal is delivered again.
        await vi.waitFor(
          () => {
            const info = consumerInfo('project-member-removed');
            expect(info.delivered.consumer_seq).toBeGreaterThan(before.delivered.consumer_seq);
            expect(info.num_redelivered).toBeGreaterThan(before.num_redelivered);
            expect(info.num_ack_pending).toBe(1);
          },
          { timeout: 45_000, interval: 500 },
        );
        expect(await removalState()).toEqual({
          ended: false,
          assignments: 2,
          entries: 0,
          events: 0,
          processed: 0,
        });
        expect(await readTask(camille, held.key)).toMatchObject({ version: 1 });

        await blocker.query('rollback');
        holding = false;
      } finally {
        if (holding) {
          await blocker.query('rollback');
        }
        blocker.release();
      }

      // Every read is one snapshot: the removal of the copy never shows without the unassignments.
      const observed: { readonly ended: boolean; readonly assignments: number }[] = [];
      await vi.waitFor(
        async () => {
          const current = await removalState();
          observed.push({ ended: current.ended, assignments: current.assignments });
          expect(current).toEqual({
            ended: true,
            assignments: 0,
            entries: 2,
            events: 2,
            processed: 1,
          });
        },
        { timeout: 90_000, interval: 500 },
      );
      expect(observed.filter((seen) => seen.ended && seen.assignments > 0)).toEqual([]);
      expect(observed.filter((seen) => !seen.ended && seen.assignments === 0)).toEqual([]);
      expect(await readTask(camille, held.key)).toMatchObject({
        assignees: [{ userId: camille.userId }],
        version: 2,
      });
      expect(await readTask(camille, other.key)).toMatchObject({ assignees: [], version: 2 });
    }, 240_000);
  });
});
