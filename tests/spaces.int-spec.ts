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
  CreateListInternalResponse,
  CreateFavoriteInternalResponse,
  CreateSavedViewInternalResponse,
  CreateSpaceInternalResponse,
  GetFavoriteInternalResponse,
  GetListInternalResponse,
  GetSpaceInternalResponse,
  ListFavoritesInternalResponse,
  ListListsInternalResponse,
  ListSpacesInternalResponse,
  UpdateListInternalResponse,
  UpdateSpaceInternalResponse,
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
import { PurgeMemberFavorites } from '../src/modules/favorites/public/purge/purge-member-favorites.js';

// The spaces and lists of the organizations, on a disposable PostgreSQL and NATS: the service as
// main.ts assembles it (the `task_app` role, the `task` NATS user), started from compose.dev.yaml as
// a throwaway Compose project on free ports, as service-wiring.int-spec.ts does. The members come
// from the copy of the memberships, fed the way organization-service feeds it: member events
// published to `EVENTS` with the `admin` user of the `nats-streams` container. The routes are called
// with internal tokens signed as the API gateway, and their answers are checked against the
// validators generated from `openapi/internal/task-service.yaml`; the outbox rows are checked
// against the schemas of `asyncapi/task-service.yaml`. Rows are read as the migrator role, which
// sets the system access of the policies, since row-level security is forced on every table. A
// removal enqueues the clean-up job of member-lifecycle, which hands the private spaces over after
// the commit: the scenarios wait for it in `pgboss.job`, and hold it with a lock on a space.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-spaces-test-${String(process.pid)}`;

/** How long the copy, the relay or the broker may take to follow a change. */
const waitOptions = { timeout: 15_000, interval: 200 } as const;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** A second organization, with its own owner, which must never meet a row of Atelier Nord. */
const atelierDeltaId = '01938f6e-0000-7000-8000-000000000002';

/** A third organization, whose owner joins late: the failing handover happens there. */
const studioLumenId = '01938f6e-0000-7000-8000-000000000003';

/** A fourth organization, whose owner never joins: a removal there needs no owner. */
const maisonVerteId = '01938f6e-0000-7000-8000-000000000004';

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

/** The new membership Léa Petit gets when she joins Atelier Nord again. */
const leaNewMemberId = '01938f6e-9000-7000-8000-0000000000ca';

/** Solène Garnier, owner of the second organization. */
const solene: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c29',
  memberId: '01938f6e-9000-7000-8000-0000000000c7',
};

/** Mathis Roux, member of the third organization. */
const mathis: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2a',
  memberId: '01938f6e-9000-7000-8000-0000000000c8',
};

/** Anaïs Lefèvre, owner of the third organization. */
const anais: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2b',
  memberId: '01938f6e-9000-7000-8000-0000000000c9',
};

/** Élise Bernard, member of the fourth organization, who owns no private space. */
const elise: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2c',
  memberId: '01938f6e-9000-7000-8000-0000000000cb',
};

/** Chloé Girard, member of the third organization, who never owns a private space. */
const chloe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2d',
  memberId: '01938f6e-9000-7000-8000-0000000000cc',
};

/** Noé Perrin, member of the third organization, whose removal is held back by a lock. */
const noe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2e',
  memberId: '01938f6e-9000-7000-8000-0000000000cd',
};

/** Théo Garnier, member of the fourth organization, who owns a private space. */
const theo: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2f',
  memberId: '01938f6e-9000-7000-8000-0000000000ce',
};

/** Jeanne Moreau, admin of the fourth organization, whom a role change makes its owner. */
const jeanne: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c30',
  memberId: '01938f6e-9000-7000-8000-0000000000cf',
};

/** The new membership Mathis Roux gets when he joins the third organization again. */
const mathisNewMemberId = '01938f6e-9000-7000-8000-0000000000d0';

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

/** One status as a space shows it. */
interface StatusShape {
  readonly category: 'open' | 'active' | 'closed';
  readonly name: string | null;
  readonly hidden: boolean;
}

/** The ten statuses of a space that changed nothing: their categories, no name, none hidden. */
const defaultStatuses: Readonly<Record<string, StatusShape>> = {
  triage: { category: 'open', name: null, hidden: false },
  backlog: { category: 'open', name: null, hidden: false },
  todo: { category: 'open', name: null, hidden: false },
  progress: { category: 'active', name: null, hidden: false },
  review: { category: 'active', name: null, hidden: false },
  testing: { category: 'active', name: null, hidden: false },
  waiting: { category: 'active', name: null, hidden: false },
  blocked: { category: 'active', name: null, hidden: false },
  done: { category: 'closed', name: null, hidden: false },
  cancelled: { category: 'closed', name: null, hidden: false },
};

/** A space, as the routes answer it. */
type SpaceBody = z.output<typeof GetSpaceInternalResponse>;

/** A list or a sprint, as the routes answer it. */
type ListBody = z.output<typeof GetListInternalResponse>;

/** HTTP verbs the spec uses. */
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** What a call adds to its path. */
interface SendOptions {
  readonly organizationId?: string;
  readonly body?: object;
  readonly headers?: Readonly<Record<string, string>>;
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
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/^application\/problem\+json/u);
  expect(bodyOf(response)).toMatchObject({
    status,
    code,
    ...(details === undefined ? {} : { details }),
  });
}

describe('spaces and lists', () => {
  const gateway = keyPair();
  let app: NestExpressApplication | undefined;
  let signer: InternalTokenSigner;
  let migrator: pg.Pool;

  // State the scenarios pass on, in the order of the file.
  let produit: SpaceBody;
  let design: SpaceBody;
  let recherche: SpaceBody;
  let rechercheFirstListId = '';
  let sprint14: ListBody;
  let studio: SpaceBody;
  let maquettes: SpaceBody;

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
    table: 'spaces' | 'lists' | 'space_prefixes' | 'favorites',
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
   * Reads the outbox rows of a space or a list, oldest first (ids come from `uuidv7()`).
   *
   * @param member - Whether the id is the `spaceId` or the `listId` of the payloads.
   * @param id - The id.
   * @returns The rows.
   */
  async function outboxOf(member: 'spaceId' | 'listId', id: string): Promise<OutboxRow[]> {
    return asSystem<OutboxRow>(
      `select event_name, status, payload from outbox_events where payload ->> '${member}' = $1 order by id`,
      [id],
    );
  }

  /**
   * Reads a space as a member and checks the answer against the contract.
   *
   * @param actor - Who reads.
   * @param spaceId - The space.
   * @returns The space.
   */
  async function readSpace(actor: Person, spaceId: string): Promise<SpaceBody> {
    const response = await send('get', `/internal/v1/spaces/${spaceId}`, actor);
    expect(response.status).toBe(200);
    return conforms(GetSpaceInternalResponse, bodyOf(response));
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
    expect(response.status).toBe(201);
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
    expect(response.status).toBe(200);
    return conforms(UpdateSpaceInternalResponse, bodyOf(response));
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

  /** A row of the clean-up queue of pg-boss, as the specs read it. */
  interface CleanUpJob {
    readonly state: string;
    readonly retry_count: number;
  }

  /**
   * Reads the clean-up jobs of an account in an organization, oldest first, as the migrator role,
   * which owns the `pgboss` schema.
   *
   * @param organizationId - The organization of the removal.
   * @param person - The account.
   * @returns The jobs.
   */
  async function cleanUpJobsOf(organizationId: string, person: Person): Promise<CleanUpJob[]> {
    const result = await migrator.query<CleanUpJob>(
      `select state, retry_count from pgboss.job
        where name = 'task.clean-up-removed-member'
          and data ->> 'organizationId' = $1 and data -> 'payload' ->> 'userId' = $2
        order by created_on, id`,
      [organizationId, person.userId],
    );
    return result.rows;
  }

  /**
   * Waits until the clean-up jobs of an account in an organization are all completed.
   *
   * @param organizationId - The organization of the removal.
   * @param person - The account.
   * @param count - How many jobs it must have.
   * @returns The jobs.
   */
  async function cleanUpsCompleted(
    organizationId: string,
    person: Person,
    count: number,
  ): Promise<CleanUpJob[]> {
    let jobs: CleanUpJob[] = [];
    await vi.waitFor(
      async () => {
        jobs = await cleanUpJobsOf(organizationId, person);
        expect(jobs.map((job) => job.state)).toEqual(
          Array.from({ length: count }, () => 'completed'),
        );
      },
      { timeout: 120_000, interval: 250 },
    );
    return jobs;
  }

  /**
   * Waits until the only clean-up job of an account failed an attempt and waits for its retry.
   *
   * @param organizationId - The organization of the removal.
   * @param person - The account.
   */
  async function cleanUpWaitingForRetry(organizationId: string, person: Person): Promise<void> {
    await vi.waitFor(
      async () => {
        const [job] = await cleanUpJobsOf(organizationId, person);
        expect(job).toMatchObject({ state: 'retry' });
        expect(job?.retry_count).toBeGreaterThanOrEqual(1);
      },
      { timeout: 60_000, interval: 250 },
    );
  }

  /**
   * Holds a row of `spaces` locked by a transaction of the migrator role, as a concurrent change
   * would hold it, while `work` runs; the lock is released after it, whatever happens.
   *
   * @param organizationId - Organization of the space.
   * @param spaceId - The space.
   * @param work - What runs while the row is held.
   */
  async function whileSpaceHeld(
    organizationId: string,
    spaceId: string,
    work: () => Promise<void>,
  ): Promise<void> {
    const blocker = await migrator.connect();
    try {
      await blocker.query('begin');
      await blocker.query(`select set_config('app.system_access', 'on', true)`);
      await blocker.query(
        `select 1 from spaces where organization_id = $1 and id = $2 for update`,
        [organizationId, spaceId],
      );
      await work();
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
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
      max: 2,
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
    // organization gets its owner. The third organization gets its owner much later.
    const joins: readonly PublishedEvent[] = [
      toPublishedEvent('joined', atelierNordId, camille, 'owner', 1),
      toPublishedEvent('joined', atelierNordId, ines, 'admin', 1),
      toPublishedEvent('joined', atelierNordId, hugo, 'member', 1),
      toPublishedEvent('joined', atelierNordId, lea, 'member', 1),
      toPublishedEvent('joined', atelierNordId, nadia, 'guest', 1),
      toPublishedEvent('joined', atelierDeltaId, solene, 'owner', 1),
    ];
    for (const join of joins) {
      publish(join);
    }
    await vi.waitFor(
      async () => {
        expect(await activeMembers(atelierNordId)).toEqual(
          [camille, ines, hugo, lea, nadia].map((person) => person.userId).sort(),
        );
        expect(await activeMembers(atelierDeltaId)).toEqual([solene.userId]);
      },
      { timeout: 60_000, interval: 500 },
    );
  }, 240_000);

  afterAll(async () => {
    try {
      await app?.close();
      await migrator.end();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  });

  describe('creating a space creates its first list and announces both', () => {
    it('answers 201 with the space "Produit", its first list "Première liste", Location and ETag', async () => {
      const response = await send('post', '/internal/v1/spaces', camille, {
        body: { name: 'Produit', prefix: 'CAD', icon: 'rocket', color: 'violet' },
      });

      expect(response.status).toBe(201);
      const created = conforms(CreateSpaceInternalResponse, bodyOf(response));
      expect(response.headers.location).toBe(`/internal/v1/spaces/${created.space.id}`);
      expect(response.headers.etag).toBe('"1"');
      expect(created.space).toMatchObject({
        name: 'Produit',
        prefix: 'CAD',
        description: null,
        icon: 'rocket',
        color: 'violet',
        visibility: 'organization',
        owner: { userId: camille.userId },
        nextKey: 'CAD-1',
        version: 1,
        statuses: defaultStatuses,
      });
      expect(created.firstList).toMatchObject({
        spaceId: created.space.id,
        name: 'Première liste',
        icon: null,
        color: 'gris',
        sprint: null,
        version: 1,
      });
      produit = created.space;
    });

    it('appends space.created.v1 then list.created.v1 in the same commit, and the relay publishes both', async () => {
      await vi.waitFor(async () => {
        const events = await outboxOf('spaceId', produit.id);
        expect(events.map((event) => [event.event_name, event.status])).toEqual([
          ['space.created.v1', 'sent'],
          ['list.created.v1', 'sent'],
        ]);
      }, waitOptions);

      const [spaceCreated, listCreated] = await outboxOf('spaceId', produit.id);
      const space = conforms(taskEventSchemas['space.created.v1'], spaceCreated?.payload);
      const list = conforms(taskEventSchemas['list.created.v1'], listCreated?.payload);
      expect(space).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: camille.userId },
        version: 1,
        spaceId: produit.id,
        name: 'Produit',
        prefix: 'CAD',
        icon: 'rocket',
        color: 'violet',
        visibility: 'organization',
        ownerUserId: camille.userId,
        statuses: Object.fromEntries(
          Object.entries(defaultStatuses).map(([key, { name, hidden }]) => [key, { name, hidden }]),
        ),
      });
      expect(list).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: camille.userId },
        version: 1,
        spaceId: produit.id,
        name: 'Première liste',
        sprint: null,
      });
    });
  });

  describe('who may create a space, and who is a member at all', () => {
    it('refuses a guest with 403 organization.role-forbidden and creates nothing', async () => {
      const before = await countRows('spaces', 'true');

      const response = await send('post', '/internal/v1/spaces', nadia, {
        body: { name: 'Archives', prefix: 'ARC' },
      });

      expectProblem(response, 403, 'organization.role-forbidden');
      expect(await countRows('spaces', 'true')).toBe(before);
      expect(await countRows('space_prefixes', `prefix = 'ARC'`)).toBe(0);
    });

    it('answers 404 organization.not-found to an actor the copy does not know, on create, list and read', async () => {
      const stranger = { userId: randomUUID() };
      const before = await countRows('spaces', 'true');

      const created = await send('post', '/internal/v1/spaces', stranger, {
        body: { name: 'Fantôme', prefix: 'FTM' },
      });
      const listed = await send('get', '/internal/v1/spaces', stranger);
      const read = await send('get', `/internal/v1/spaces/${produit.id}`, stranger);
      const lists = await send('get', `/internal/v1/spaces/${produit.id}/lists`, stranger);

      for (const response of [created, listed, read, lists]) {
        expectProblem(response, 404, 'organization.not-found');
      }
      expect(await countRows('spaces', 'true')).toBe(before);
    });
  });

  describe('a prefix belongs for good to the first space that took it', () => {
    it('answers 409 space.prefix-taken with the prefix and creates no space', async () => {
      const before = await countRows('spaces', 'true');

      const response = await send('post', '/internal/v1/spaces', hugo, {
        body: { name: 'Design', prefix: 'CAD' },
      });

      expectProblem(response, 409, 'space.prefix-taken', { prefix: 'CAD' });
      expect(await countRows('spaces', 'true')).toBe(before);
      expect(await countRows('spaces', `name = 'Design'`)).toBe(0);
    });

    it('keeps the former prefix of a space reserved to it when the space changes prefix', async () => {
      const renamed = await patchSpace(camille, produit.id, { prefix: 'PRD' });

      expect(renamed).toMatchObject({ prefix: 'PRD', nextKey: 'PRD-1', version: 2 });
      const reserved = await asSystem<{ readonly prefix: string }>(
        `select prefix from space_prefixes where organization_id = $1 and space_id = $2 order by prefix`,
        [atelierNordId, produit.id],
      );
      expect(reserved.map((row) => row.prefix)).toEqual(['CAD', 'PRD']);

      const refused = await send('post', '/internal/v1/spaces', hugo, {
        body: { name: 'Design', prefix: 'CAD' },
      });
      expectProblem(refused, 409, 'space.prefix-taken', { prefix: 'CAD' });
      expect(await countRows('spaces', `name = 'Design'`)).toBe(0);
    });

    it('refuses a space that changes to the prefix of another and leaves it as it was', async () => {
      design = (await createSpace(hugo, { name: 'Design', prefix: 'DSN' })).space;

      const response = await send('patch', `/internal/v1/spaces/${design.id}`, hugo, {
        body: { prefix: 'CAD' },
      });

      expectProblem(response, 409, 'space.prefix-taken', { prefix: 'CAD' });
      expect(await readSpace(hugo, design.id)).toMatchObject({ prefix: 'DSN', version: 1 });
    });

    it('lets the space take back one of its former prefixes', async () => {
      const taken = await patchSpace(camille, produit.id, { prefix: 'CAD' });

      expect(taken).toMatchObject({ prefix: 'CAD', nextKey: 'CAD-1', version: 3 });
      expect(await countRows('space_prefixes', 'space_id = $2', produit.id)).toBe(2);
      produit = taken;
    });

    it('previews CAD-42 as the next key once the numbers up to 41 are given', async () => {
      await asSystem(
        `update space_prefixes set last_number = 41 where organization_id = $1 and prefix = 'CAD'`,
        [atelierNordId],
      );

      expect(await readSpace(camille, produit.id)).toMatchObject({
        prefix: 'CAD',
        nextKey: 'CAD-42',
      });
    });
  });

  describe('a private space is seen by its owner only', () => {
    it('hides a private space of Hugo from the owner and the admin of the organization, in the read and in the list', async () => {
      const created = await createSpace(hugo, {
        name: 'Recherche',
        prefix: 'RCH',
        visibility: 'private',
      });
      recherche = created.space;
      rechercheFirstListId = created.firstList.id;

      expect(await readSpace(hugo, recherche.id)).toMatchObject({ visibility: 'private' });
      for (const viewer of [camille, ines, lea]) {
        expectProblem(
          await send('get', `/internal/v1/spaces/${recherche.id}`, viewer),
          404,
          'space.not-found',
        );
        const listed = await send('get', '/internal/v1/spaces?limit=100', viewer);
        const page = conforms(ListSpacesInternalResponse, bodyOf(listed));
        expect(page.items.map((space) => space.id)).not.toContain(recherche.id);
        expect(page.items.map((space) => space.id)).toContain(produit.id);
      }
      const own = conforms(
        ListSpacesInternalResponse,
        bodyOf(await send('get', '/internal/v1/spaces?limit=100', hugo)),
      );
      expect(own.items.map((space) => space.id)).toContain(recherche.id);
    });

    it('shows a guest no space at all', async () => {
      expectProblem(
        await send('get', `/internal/v1/spaces/${produit.id}`, nadia),
        404,
        'space.not-found',
      );
      const listed = await send('get', '/internal/v1/spaces', nadia);
      expect(conforms(ListSpacesInternalResponse, bodyOf(listed)).items).toEqual([]);
    });

    it('refuses a member who does not own the space the change of its visibility', async () => {
      const response = await send('patch', `/internal/v1/spaces/${produit.id}`, lea, {
        body: { visibility: 'private' },
      });

      expectProblem(response, 403, 'space.visibility-forbidden');
      expect(await readSpace(camille, produit.id)).toMatchObject({
        visibility: 'organization',
        version: produit.version,
      });
    });

    it('lets an admin make an organization space private, and then she no longer sees it', async () => {
      const made = await send('patch', `/internal/v1/spaces/${design.id}`, ines, {
        body: { visibility: 'private' },
      });

      expect(made.status).toBe(200);
      expect(conforms(UpdateSpaceInternalResponse, bodyOf(made))).toMatchObject({
        visibility: 'private',
        owner: { userId: hugo.userId },
      });
      for (const viewer of [ines, camille]) {
        expectProblem(
          await send('get', `/internal/v1/spaces/${design.id}`, viewer),
          404,
          'space.not-found',
        );
      }
      expect(await readSpace(hugo, design.id)).toMatchObject({ visibility: 'private' });
    });

    it('lets a member who sees a space change anything else about it, and tells who did', async () => {
      const edited = await patchSpace(lea, produit.id, {
        description: 'Feuille de route et livraisons',
      });

      expect(edited).toMatchObject({
        description: 'Feuille de route et livraisons',
        owner: { userId: camille.userId },
        version: produit.version + 1,
      });
      await vi.waitFor(async () => {
        const events = await outboxOf('spaceId', produit.id);
        expect(events.at(-1)).toMatchObject({ event_name: 'space.updated.v1', status: 'sent' });
      }, waitOptions);
      const last = (await outboxOf('spaceId', produit.id)).at(-1);
      expect(conforms(taskEventSchemas['space.updated.v1'], last?.payload)).toMatchObject({
        actor: { type: 'user', id: lea.userId },
        changed: ['description'],
        version: produit.version + 1,
      });
      produit = edited;
    });
  });

  describe('the statuses of a space', () => {
    it('renames a status and hides another, leaving the eight others as they were', async () => {
      const changed = await patchSpace(camille, produit.id, {
        statuses: { review: { name: 'Relecture' }, waiting: { hidden: true } },
      });

      expect(changed.statuses).toEqual({
        ...defaultStatuses,
        review: { category: 'active', name: 'Relecture', hidden: false },
        waiting: { category: 'active', name: null, hidden: true },
      });
      expect(changed.version).toBe(produit.version + 1);
      produit = changed;
    });

    it('refuses to hide "todo" with 422 space.status-required and changes nothing', async () => {
      const response = await send('patch', `/internal/v1/spaces/${produit.id}`, camille, {
        body: { statuses: { todo: { hidden: true } } },
      });

      expectProblem(response, 422, 'space.status-required', { status: 'todo' });
      expect(await readSpace(camille, produit.id)).toEqual(produit);
    });

    it('puts back every default with statuses: null', async () => {
      const reset = await patchSpace(camille, produit.id, { statuses: null });

      expect(reset.statuses).toEqual(defaultStatuses);
      expect(reset.version).toBe(produit.version + 1);
      produit = reset;
    });

    it('refuses a name made only of spaces, of the space or of a status, with 400 request.invalid', async () => {
      for (const body of [{ name: '   ' }, { statuses: { review: { name: '   ' } } }]) {
        const response = await send('patch', `/internal/v1/spaces/${produit.id}`, camille, {
          body,
        });
        expectProblem(response, 400, 'request.invalid');
      }
      const created = await send('post', '/internal/v1/spaces', camille, {
        body: { name: '   ', prefix: 'VID' },
      });
      expectProblem(created, 400, 'request.invalid');
      expect(await readSpace(camille, produit.id)).toEqual(produit);
      expect(await countRows('space_prefixes', `prefix = 'VID'`)).toBe(0);
    });

    it('answers 200 with the same version and appends no outbox row for a patch that changes nothing', async () => {
      const before = await outboxOf('spaceId', produit.id);

      for (const body of [{}, { name: 'Produit' }, { statuses: { review: { name: null } } }]) {
        const response = await send('patch', `/internal/v1/spaces/${produit.id}`, camille, {
          body,
        });
        expect(response.status).toBe(200);
        expect(conforms(UpdateSpaceInternalResponse, bodyOf(response)).version).toBe(
          produit.version,
        );
        expect(response.headers.etag).toBe(`"${String(produit.version)}"`);
      }

      expect(await outboxOf('spaceId', produit.id)).toHaveLength(before.length);
    });
  });

  describe('If-Match guards a change against a stale version', () => {
    it('answers 412 request.version-mismatch with the stored version, and accepts the current one', async () => {
      const stale = `"${String(produit.version - 1)}"`;
      const current = `"${String(produit.version)}"`;

      const refused = await send('patch', `/internal/v1/spaces/${produit.id}`, camille, {
        body: { color: 'indigo' },
        headers: { 'If-Match': stale },
      });
      expectProblem(refused, 412, 'request.version-mismatch', { version: produit.version });
      expect(await readSpace(camille, produit.id)).toMatchObject({ color: 'violet' });

      const accepted = await send('patch', `/internal/v1/spaces/${produit.id}`, camille, {
        body: { color: 'indigo' },
        headers: { 'If-Match': current },
      });
      expect(accepted.status).toBe(200);
      expect(conforms(UpdateSpaceInternalResponse, bodyOf(accepted))).toMatchObject({
        color: 'indigo',
        version: produit.version + 1,
      });
      expect(accepted.headers.etag).toBe(`"${String(produit.version + 1)}"`);
      produit = await patchSpace(camille, produit.id, { color: 'violet' });
    });
  });

  describe('lists and sprints', () => {
    it('creates a list with 201, Location and ETag, and announces it', async () => {
      const response = await send('post', `/internal/v1/spaces/${produit.id}/lists`, camille, {
        body: { name: 'Backlog produit' },
      });

      expect(response.status).toBe(201);
      const list = conforms(CreateListInternalResponse, bodyOf(response));
      expect(list).toMatchObject({
        spaceId: produit.id,
        name: 'Backlog produit',
        icon: null,
        color: 'gris',
        sprint: null,
        version: 1,
      });
      expect(response.headers.location).toBe(`/internal/v1/lists/${list.id}`);
      expect(response.headers.etag).toBe('"1"');
      await vi.waitFor(async () => {
        const events = await outboxOf('listId', list.id);
        expect(events.map((event) => [event.event_name, event.status])).toEqual([
          ['list.created.v1', 'sent'],
        ]);
      }, waitOptions);
    });

    it('creates the sprint "Sprint 14" with its dates and goal, and announces it', async () => {
      const response = await send('post', `/internal/v1/spaces/${produit.id}/lists`, camille, {
        body: {
          name: 'Sprint 14',
          sprint: {
            startDate: '2026-11-03',
            endDate: '2026-11-17',
            goal: 'Stabiliser la vue calendrier',
          },
        },
      });

      expect(response.status).toBe(201);
      sprint14 = conforms(CreateListInternalResponse, bodyOf(response));
      expect(sprint14).toMatchObject({
        name: 'Sprint 14',
        sprint: {
          startDate: '2026-11-03',
          endDate: '2026-11-17',
          goal: 'Stabiliser la vue calendrier',
        },
      });
      await vi.waitFor(async () => {
        const [created] = await outboxOf('listId', sprint14.id);
        expect(created?.event_name).toBe('list.created.v1');
      }, waitOptions);
      const [created] = await outboxOf('listId', sprint14.id);
      expect(conforms(taskEventSchemas['list.created.v1'], created?.payload)).toMatchObject({
        listId: sprint14.id,
        spaceId: produit.id,
        sprint: {
          startDate: '2026-11-03',
          endDate: '2026-11-17',
          goal: 'Stabiliser la vue calendrier',
        },
      });
    });

    it('refuses a sprint that ends before it starts with 422 list.sprint-dates-invalid, on creation and on change', async () => {
      const before = await countRows('lists', 'space_id = $2', produit.id);

      const created = await send('post', `/internal/v1/spaces/${produit.id}/lists`, camille, {
        body: { name: 'Sprint 15', sprint: { startDate: '2026-11-17', endDate: '2026-11-03' } },
      });
      const changed = await send('patch', `/internal/v1/lists/${sprint14.id}`, camille, {
        body: { sprint: { startDate: '2026-11-17', endDate: '2026-11-03' } },
      });

      expectProblem(created, 422, 'list.sprint-dates-invalid');
      expectProblem(changed, 422, 'list.sprint-dates-invalid');
      expect(await countRows('lists', 'space_id = $2', produit.id)).toBe(before);
    });

    it('refuses a list name made only of spaces with 400 request.invalid, on creation and on change', async () => {
      const before = await countRows('lists', 'space_id = $2', produit.id);

      const created = await send('post', `/internal/v1/spaces/${produit.id}/lists`, camille, {
        body: { name: '   ' },
      });
      const changed = await send('patch', `/internal/v1/lists/${sprint14.id}`, camille, {
        body: { name: '   ' },
      });

      expectProblem(created, 400, 'request.invalid');
      expectProblem(changed, 400, 'request.invalid');
      expect(await countRows('lists', 'space_id = $2', produit.id)).toBe(before);
      const unchanged = await send('get', `/internal/v1/lists/${sprint14.id}`, camille);
      expect(conforms(GetListInternalResponse, bodyOf(unchanged))).toEqual(sprint14);
    });

    it('reads a list as any member who sees its space', async () => {
      for (const viewer of [camille, lea]) {
        const response = await send('get', `/internal/v1/lists/${sprint14.id}`, viewer);
        expect(response.status).toBe(200);
        expect(conforms(GetListInternalResponse, bodyOf(response))).toEqual(sprint14);
        expect(response.headers.etag).toBe('"1"');
      }
      expectProblem(
        await send('get', `/internal/v1/lists/${randomUUID()}`, camille),
        404,
        'list.not-found',
      );
    });

    it('keeps the goal when a patch moves the dates, and announces what changed', async () => {
      const response = await send('patch', `/internal/v1/lists/${sprint14.id}`, camille, {
        body: { sprint: { startDate: '2026-11-05', endDate: '2026-11-19' } },
        headers: { 'If-Match': '"1"' },
      });

      expect(response.status).toBe(200);
      const moved = conforms(UpdateListInternalResponse, bodyOf(response));
      expect(moved).toMatchObject({
        version: 2,
        sprint: {
          startDate: '2026-11-05',
          endDate: '2026-11-19',
          goal: 'Stabiliser la vue calendrier',
        },
      });
      expect(response.headers.etag).toBe('"2"');
      expectProblem(
        await send('patch', `/internal/v1/lists/${sprint14.id}`, camille, {
          body: { name: 'Sprint 14 bis' },
          headers: { 'If-Match': '"1"' },
        }),
        412,
        'request.version-mismatch',
        { version: 2 },
      );
    });

    it('makes a sprint a list again with sprint: null, dropping its dates and goal', async () => {
      const response = await send('patch', `/internal/v1/lists/${sprint14.id}`, camille, {
        body: { sprint: null },
      });

      expect(response.status).toBe(200);
      expect(conforms(UpdateListInternalResponse, bodyOf(response))).toMatchObject({
        id: sprint14.id,
        sprint: null,
        version: 3,
      });
      const [row] = await asSystem<{
        readonly sprint_start_date: unknown;
        readonly sprint_end_date: unknown;
        readonly sprint_goal: unknown;
      }>(
        `select sprint_start_date, sprint_end_date, sprint_goal from lists
          where organization_id = $1 and id = $2`,
        [atelierNordId, sprint14.id],
      );
      expect(row).toEqual({ sprint_start_date: null, sprint_end_date: null, sprint_goal: null });

      await vi.waitFor(async () => {
        const events = await outboxOf('listId', sprint14.id);
        expect(events.map((event) => [event.event_name, event.status])).toEqual([
          ['list.created.v1', 'sent'],
          ['list.updated.v1', 'sent'],
          ['list.updated.v1', 'sent'],
        ]);
      }, waitOptions);
      const events = await outboxOf('listId', sprint14.id);
      expect(conforms(taskEventSchemas['list.updated.v1'], events[1]?.payload)).toMatchObject({
        version: 2,
        changed: ['sprint'],
      });
      expect(conforms(taskEventSchemas['list.updated.v1'], events[2]?.payload)).toMatchObject({
        version: 3,
        sprint: null,
        changed: ['sprint'],
        actor: { type: 'user', id: camille.userId },
      });
    });

    it('answers 404 for the lists of a private space of another member, and refuses to create one in it', async () => {
      expect(
        conforms(
          ListListsInternalResponse,
          bodyOf(await send('get', `/internal/v1/spaces/${recherche.id}/lists`, hugo)),
        ).items.map((list) => list.id),
      ).toEqual([rechercheFirstListId]);

      for (const viewer of [camille, ines]) {
        expectProblem(
          await send('get', `/internal/v1/lists/${rechercheFirstListId}`, viewer),
          404,
          'list.not-found',
        );
        expectProblem(
          await send('patch', `/internal/v1/lists/${rechercheFirstListId}`, viewer, {
            body: { name: 'Autre nom' },
          }),
          404,
          'list.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/spaces/${recherche.id}/lists`, viewer),
          404,
          'space.not-found',
        );
        expectProblem(
          await send('post', `/internal/v1/spaces/${recherche.id}/lists`, viewer, {
            body: { name: 'Intruse' },
          }),
          404,
          'space.not-found',
        );
      }
      expect(await countRows('lists', `name = 'Intruse' or name = 'Autre nom'`)).toBe(0);
    });
  });

  describe('paging walks every item once, in the order of creation', () => {
    it('walks the spaces one by one with nextCursor until null, as the full list says', async () => {
      await createSpace(camille, { name: 'Support', prefix: 'SUP', color: 'azur' });
      await createSpace(hugo, { name: 'Ventes', prefix: 'VTE' });
      await createSpace(camille, { name: 'Finance', prefix: 'FIN', visibility: 'private' });
      const full = conforms(
        ListSpacesInternalResponse,
        bodyOf(await send('get', '/internal/v1/spaces?limit=100', camille)),
      );
      expect(full.nextCursor).toBeNull();
      expect(full.items.slice(-3).map((space) => space.name)).toEqual([
        'Support',
        'Ventes',
        'Finance',
      ]);
      const createdAt = full.items.map((space) => space.createdAt);
      expect(createdAt).toEqual([...createdAt].sort());

      const walked: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string =
          cursor === null ? 'limit=1' : `limit=1&cursor=${encodeURIComponent(cursor)}`;
        const response = await send('get', `/internal/v1/spaces?${query}`, camille);
        expect(response.status).toBe(200);
        const page = conforms(ListSpacesInternalResponse, bodyOf(response));
        expect(page.items).toHaveLength(1);
        walked.push(...page.items.map((space) => space.id));
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(walked).toEqual(full.items.map((space) => space.id));
      expect(new Set(walked).size).toBe(walked.length);
    });

    it('walks the lists of a space one by one, the first list first', async () => {
      const full = conforms(
        ListListsInternalResponse,
        bodyOf(await send('get', `/internal/v1/spaces/${produit.id}/lists?limit=100`, camille)),
      );
      expect(full.items.map((list) => list.name)).toEqual([
        'Première liste',
        'Backlog produit',
        'Sprint 14',
      ]);

      const walked: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string =
          cursor === null ? 'limit=1' : `limit=1&cursor=${encodeURIComponent(cursor)}`;
        const response = await send(
          'get',
          `/internal/v1/spaces/${produit.id}/lists?${query}`,
          camille,
        );
        expect(response.status).toBe(200);
        const page = conforms(ListListsInternalResponse, bodyOf(response));
        expect(page.items).toHaveLength(1);
        walked.push(...page.items.map((list) => list.id));
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(walked).toEqual(full.items.map((list) => list.id));
    });

    it('refuses with 400 request.invalid a cursor of the spaces used on the lists, and one that is no cursor', async () => {
      const page = conforms(
        ListSpacesInternalResponse,
        bodyOf(await send('get', '/internal/v1/spaces?limit=1', camille)),
      );
      expect(page.nextCursor).not.toBeNull();
      const cursor = encodeURIComponent(page.nextCursor ?? '');

      expectProblem(
        await send('get', `/internal/v1/spaces/${produit.id}/lists?cursor=${cursor}`, camille),
        400,
        'request.invalid',
      );
      expectProblem(
        await send('get', '/internal/v1/spaces?cursor=not-a-cursor', camille),
        400,
        'request.invalid',
      );
    });
  });

  describe('the same Idempotency-Key replays the first answer instead of creating again', () => {
    it('replays a space creation with the same status and body, and creates one space', async () => {
      const body = { name: 'Marketing', prefix: 'MKT', color: 'orange' };
      const headers = { 'Idempotency-Key': 'creer-marketing-1' };

      const first = await send('post', '/internal/v1/spaces', camille, { body, headers });
      const again = await send('post', '/internal/v1/spaces', camille, { body, headers });

      expect(first.status).toBe(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(again.status).toBe(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(bodyOf(again)).toEqual(bodyOf(first));
      conforms(CreateSpaceInternalResponse, bodyOf(again));
      expect(await countRows('spaces', `name = 'Marketing'`)).toBe(1);
      expect(await countRows('space_prefixes', `prefix = 'MKT'`)).toBe(1);
    });

    it('refuses the same key with another body with 422 idempotency.key-reused', async () => {
      const response = await send('post', '/internal/v1/spaces', camille, {
        body: { name: 'Marketing et ventes', prefix: 'MKV' },
        headers: { 'Idempotency-Key': 'creer-marketing-1' },
      });

      expectProblem(response, 422, 'idempotency.key-reused');
      expect(await countRows('spaces', `name = 'Marketing et ventes'`)).toBe(0);
    });

    it('replays a space creation with the ETag of the version of the space and its Location', async () => {
      const body = { name: 'Logistique', prefix: 'LOG' };
      const headers = { 'Idempotency-Key': 'creer-logistique-1' };

      const first = await send('post', '/internal/v1/spaces', camille, { body, headers });
      const again = await send('post', '/internal/v1/spaces', camille, { body, headers });

      const created = conforms(CreateSpaceInternalResponse, bodyOf(first));
      expect(first.status).toBe(201);
      expect(first.headers.etag).toBe(`"${String(created.space.version)}"`);
      expect(first.headers.location).toBe(`/internal/v1/spaces/${created.space.id}`);
      expect(again.status).toBe(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(again.headers.etag).toBe(`"${String(created.space.version)}"`);
      expect(again.headers.location).toBe(first.headers.location);
      expect(bodyOf(again)).toEqual(bodyOf(first));
      expect(await countRows('spaces', `name = 'Logistique'`)).toBe(1);
    });

    it('refuses a malformed key with 400 request.invalid and one issue on the header, and creates nothing', async () => {
      const response = await send('post', '/internal/v1/spaces', camille, {
        body: { name: 'Achats', prefix: 'ACH' },
        headers: { 'Idempotency-Key': 'creer achats 1' },
      });

      expectProblem(response, 400, 'request.invalid');
      expect(bodyOf(response)).toMatchObject({
        details: { issues: [{ in: 'header', path: 'Idempotency-Key', code: 'invalid_format' }] },
      });
      expect(await countRows('spaces', `name = 'Achats'`)).toBe(0);
    });

    it('answers 409 idempotency.request-in-progress while the first request with the key runs, then creates one space', async () => {
      const body = { name: 'Achats', prefix: 'ACH' };
      const headers = { 'Idempotency-Key': 'creer-achats-1' };
      const blocker = await migrator.connect();
      let holding = false;
      let first: Promise<request.Response> | undefined;

      try {
        // The membership of Camille is held, so the creation waits on its read `FOR SHARE`, inside
        // the transaction that holds the lock of the key. The release comes well before the
        // `lock_timeout` of the application role (5 s).
        await blocker.query('begin');
        holding = true;
        await blocker.query(`select set_config('app.system_access', 'on', true)`);
        await blocker.query(
          `select 1 from organization_members where organization_id = $1 and id = $2 for update`,
          [atelierNordId, camille.memberId],
        );
        first = send('post', '/internal/v1/spaces', camille, { body, headers });
        await vi.waitFor(
          async () => {
            const waiting = await blocker.query<{ readonly total: number }>(
              'select count(*)::int as total from pg_locks where not granted',
            );
            expect(waiting.rows[0]?.total).toBeGreaterThan(0);
          },
          { timeout: 3_000, interval: 50 },
        );

        const during = await send('post', '/internal/v1/spaces', camille, { body, headers });

        expectProblem(during, 409, 'idempotency.request-in-progress');
        await blocker.query('rollback');
        holding = false;
      } finally {
        if (holding) {
          await blocker.query('rollback');
        }
        blocker.release();
      }

      const created = await first;
      const again = await send('post', '/internal/v1/spaces', camille, { body, headers });
      expect(created.status).toBe(201);
      expect(again.status).toBe(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(bodyOf(again)).toEqual(bodyOf(created));
      expect(await countRows('spaces', `name = 'Achats'`)).toBe(1);
    });

    it('replays a list creation with the same status and body, and creates one list', async () => {
      const body = { name: 'Rétrospectives' };
      const headers = { 'Idempotency-Key': 'creer-retrospectives-1' };
      const path = `/internal/v1/spaces/${produit.id}/lists`;

      const first = await send('post', path, camille, { body, headers });
      const again = await send('post', path, camille, { body, headers });
      const other = await send('post', path, camille, { body: { name: 'Autre' }, headers });

      expect(first.status).toBe(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(again.status).toBe(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(bodyOf(again)).toEqual(bodyOf(first));
      const replayed = conforms(CreateListInternalResponse, bodyOf(again));
      expect(first.headers.etag).toBe(`"${String(replayed.version)}"`);
      expect(again.headers.etag).toBe(`"${String(replayed.version)}"`);
      expectProblem(other, 422, 'idempotency.key-reused');
      expect(await countRows('lists', `name = 'Rétrospectives'`)).toBe(1);
      expect(await countRows('lists', `name = 'Autre'`)).toBe(0);
    });
  });

  describe('private favorites', () => {
    const collection = '/internal/v1/me/favorites';

    it('replays creation, isolates actor and tenant, and hides a listed favorite until unarchive', async () => {
      const { space, firstList } = await createSpace(camille, { name: 'Favoris', prefix: 'FAV' });
      const body = { kind: 'space', targetId: space.id };
      const headers = { 'Idempotency-Key': 'favorite-space-replay' };
      const created = await send('post', collection, lea, { body, headers });
      const replay = await send('post', collection, lea, { body, headers });

      expect(created.status).toBe(201);
      const favorite = conforms(CreateFavoriteInternalResponse, bodyOf(created));
      const path = `${collection}/${favorite.id}`;
      expect(favorite.target).toEqual({ name: 'Favoris', href: `/v1/spaces/${space.id}` });
      expect(created.headers.location).toBe(path);
      expect(created.headers.etag).toBe('"1"');
      expect(replay.status).toBe(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.headers.location).toBe(path);
      expect(bodyOf(replay)).toEqual(bodyOf(created));
      expectProblem(await send('post', collection, lea, { body }), 409, 'favorite.already-exists');

      const sameTarget = await send('post', collection, camille, { body });
      expect(sameTarget.status).toBe(201);
      expect(conforms(CreateFavoriteInternalResponse, bodyOf(sameTarget)).id).not.toBe(favorite.id);
      expectProblem(await send('get', path, camille), 404, 'favorite.not-found');
      expectProblem(await send('delete', path, camille), 404, 'favorite.not-found');
      expectProblem(
        await send('get', path, solene, { organizationId: atelierDeltaId }),
        404,
        'favorite.not-found',
      );
      const read = await send('get', path, lea);
      expect(read.status).toBe(200);
      expect(conforms(GetFavoriteInternalResponse, bodyOf(read))).toEqual(favorite);
      expect(read.headers.etag).toBe('"1"');

      const listFavorite = await send('post', collection, lea, {
        body: { kind: 'list', targetId: firstList.id },
      });
      expect(listFavorite.status).toBe(201);
      const listed = conforms(CreateFavoriteInternalResponse, bodyOf(listFavorite));
      const listPath = `${collection}/${listed.id}`;
      const page = await send('get', `${collection}?limit=1`, lea);
      expect(page.status).toBe(200);
      const first = conforms(ListFavoritesInternalResponse, bodyOf(page));
      expect(first.items.map(({ id }) => id)).toEqual([favorite.id]);
      expect(first.nextCursor).not.toBeNull();
      const cursor = encodeURIComponent(first.nextCursor ?? '');
      const next = await send('get', `${collection}?cursor=${cursor}`, lea);
      expect(conforms(ListFavoritesInternalResponse, bodyOf(next))).toEqual({
        items: [listed],
        nextCursor: null,
      });
      expectProblem(
        await send('get', `${collection}?cursor=${cursor}`, camille),
        400,
        'request.invalid',
      );

      expect(
        (await send('post', `/internal/v1/lists/${firstList.id}/archive`, camille, { body: {} }))
          .status,
      ).toBe(200);
      expectProblem(await send('get', listPath, lea), 404, 'favorite.not-found');
      expectProblem(await send('delete', listPath, lea), 404, 'favorite.not-found');
      const archived = await send('get', `${collection}?limit=1`, lea);
      expect(conforms(ListFavoritesInternalResponse, bodyOf(archived))).toEqual({
        items: [favorite],
        nextCursor: null,
      });
      expect(
        (await send('post', `/internal/v1/lists/${firstList.id}/unarchive`, camille, { body: {} }))
          .status,
      ).toBe(200);
      expect(
        conforms(GetFavoriteInternalResponse, bodyOf(await send('get', listPath, lea))),
      ).toEqual(listed);
      expectProblem(
        await send('delete', listPath, lea, { headers: { 'If-Match': '"2"' } }),
        412,
        'request.version-mismatch',
      );
      expect((await send('delete', listPath, lea, { headers: { 'If-Match': '"1"' } })).status).toBe(
        204,
      );
      expect((await send('delete', path, lea)).status).toBe(204);
    });

    it('serializes an in-flight space favorite against revocation of its only list grant', async () => {
      const { space, firstList } = await createSpace(camille, {
        name: 'Espace partagé par liste',
        prefix: 'FGR',
        visibility: 'private',
      });
      const grant = `/internal/v1/lists/${firstList.id}/grants/${nadia.userId}`;
      const body = { kind: 'space', targetId: space.id };
      expectProblem(
        await send('post', collection, nadia, { body }),
        404,
        'favorite.target-not-found',
      );
      expect((await send('put', grant, camille, { body: { role: 'view' } })).status).toBe(200);

      const waitForLock = (statement: string): Promise<void> =>
        vi.waitFor(async () => {
          const pending = await inTenant(atelierNordId, (client) =>
            client.query(
              `select 1 from pg_stat_activity
               where pid <> pg_backend_pid() and wait_event_type = 'Lock' and query like $1`,
              [statement],
            ),
          );
          expect(pending.rows).toHaveLength(1);
        }, waitOptions);

      const blocker = await migrator.connect();
      let creation: Promise<request.Response> | undefined;
      let revocation: Promise<request.Response> | undefined;
      try {
        await blocker.query('begin');
        // Favorite reads stay available while the insert waits after the locked visibility check.
        await blocker.query('lock table favorites in share mode');
        creation = send('post', collection, nadia, { body });
        void creation.catch(() => undefined);
        await waitForLock('insert into "favorites"%');

        revocation = send('delete', grant, camille);
        void revocation.catch(() => undefined);
        await waitForLock('select %from "spaces"%for share%');

        await blocker.query('rollback');
        const created = await creation;
        expect(created.status).toBe(201);
        const { id } = conforms(CreateFavoriteInternalResponse, bodyOf(created));
        expect((await revocation).status).toBe(204);
        expectProblem(await send('get', `${collection}/${id}`, nadia), 404, 'favorite.not-found');
        expectProblem(
          await send('post', collection, nadia, { body }),
          404,
          'favorite.target-not-found',
        );
        expect(await countRows('favorites', 'id = $2', id)).toBe(1);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled([creation, revocation]);
      }
    });

    it('purges saved-view favorites for all owners in the transaction deleting the view', async () => {
      const { firstList } = await createSpace(camille, { name: 'Vues favorites', prefix: 'VFA' });
      const views = `/internal/v1/lists/${firstList.id}/saved-views`;
      const response = await send('post', views, camille, {
        body: {
          name: 'Perspective',
          configuration: { layout: 'list', filters: {}, sort: 'manual', groupBy: null },
        },
      });
      expect(response.status).toBe(201);
      const view = conforms(CreateSavedViewInternalResponse, bodyOf(response));
      const body = { kind: 'saved-view', targetId: view.id };

      const own = await send('post', collection, camille, { body });
      const other = await send('post', collection, lea, { body });
      expect(own.status).toBe(201);
      expect(other.status).toBe(201);
      const favorite = conforms(CreateFavoriteInternalResponse, bodyOf(other));
      expect(favorite.target).toEqual({
        name: view.name,
        listId: firstList.id,
        href: `/v1/lists/${firstList.id}/saved-views/${view.id}`,
      });
      expect(await countRows('favorites', 'target_id = $2', view.id)).toBe(2);

      expect((await send('delete', `${views}/${view.id}`, camille)).status).toBe(204);
      expect(await countRows('favorites', 'target_id = $2', view.id)).toBe(0);
      expectProblem(
        await send('get', `${collection}/${favorite.id}`, lea),
        404,
        'favorite.not-found',
      );
      expectProblem(
        await send('post', collection, lea, { body }),
        404,
        'favorite.target-not-found',
      );
    });

    it('serializes concurrent additions at capacity including hidden stored favorites', async () => {
      const { space, firstList } = await createSpace(camille, {
        name: 'Limite favoris',
        prefix: 'LFA',
      });
      await inTenant(atelierNordId, (client) =>
        client.query(
          `insert into favorites (organization_id, user_id, kind, target_id)
           select $1::uuid, $2::uuid, 'list', uuidv7() from generate_series(1, 199)`,
          [atelierNordId, ines.userId],
        ),
      );
      try {
        const outcomes = await Promise.all([
          send('post', collection, ines, { body: { kind: 'space', targetId: space.id } }),
          send('post', collection, ines, { body: { kind: 'list', targetId: firstList.id } }),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([201, 422]);
        const refusal = outcomes.find(({ status }) => status === 422);
        expect(refusal).toBeDefined();
        if (refusal !== undefined) {
          expectProblem(refusal, 422, 'favorite.limit-reached');
        }
        expect(await countRows('favorites', 'user_id = $2', ines.userId)).toBe(200);
      } finally {
        await inTenant(atelierNordId, (client) =>
          client.query('delete from favorites where organization_id = $1 and user_id = $2', [
            atelierNordId,
            ines.userId,
          ]),
        );
      }
    });

    it('lets a rejoined account add a favorite after its older collection is cleared', async () => {
      const { space, firstList } = await createSpace(camille, {
        name: 'Retour aux favoris',
        prefix: 'RFA',
      });
      const actor = { userId: randomUUID() };
      const oldFavorite = randomUUID();
      await inTenant(atelierNordId, async (client) => {
        await client.query(
          `insert into organization_members
             (organization_id, id, user_id, role, version, removed_at)
           values ($1, $2, $3, 'member', 2, now())`,
          [atelierNordId, randomUUID(), actor.userId],
        );
        await client.query(
          `insert into favorites (organization_id, id, user_id, kind, target_id)
           values ($1, $2, $3, 'list', $4)`,
          [atelierNordId, oldFavorite, actor.userId, firstList.id],
        );
      });

      const blocker = await migrator.connect();
      let cleanup: Promise<void> | undefined;
      let adding: Promise<request.Response> | undefined;
      try {
        await blocker.query('begin');
        await blocker.query(`select set_config('app.system_access', 'on', true)`);
        await blocker.query(
          'select 1 from favorites where organization_id = $1 and id = $2 for update',
          [atelierNordId, oldFavorite],
        );
        cleanup = inTenant(atelierNordId, () =>
          service().get(PurgeMemberFavorites).execute({
            organizationId: atelierNordId,
            userId: actor.userId,
          }),
        );
        void cleanup.catch(() => undefined);

        await vi.waitFor(async () => {
          const pending = await inTenant(atelierNordId, (client) =>
            client.query(
              `select 1 from pg_stat_activity where pid <> pg_backend_pid()
               and wait_event_type = 'Lock' and query like 'delete from "favorites"%'`,
            ),
          );
          expect(pending.rows).toHaveLength(1);
        }, waitOptions);

        await inTenant(atelierNordId, (client) =>
          client.query(
            `insert into organization_members (organization_id, id, user_id, role, version)
             values ($1, $2, $3, 'member', 1)`,
            [atelierNordId, randomUUID(), actor.userId],
          ),
        );
        adding = send('post', collection, actor, { body: { kind: 'space', targetId: space.id } });
        void adding.catch(() => undefined);

        await vi.waitFor(async () => {
          const pending = await inTenant(atelierNordId, (client) =>
            client.query(
              `select 1 from pg_stat_activity where pid <> pg_backend_pid()
               and wait_event = 'advisory' and query like 'select pg_advisory_xact_lock(%'`,
            ),
          );
          expect(pending.rows).toHaveLength(1);
        }, waitOptions);

        await blocker.query('rollback');
        await cleanup;
        const added = await adding;
        expect(added.status).toBe(201);
        const current = conforms(
          ListFavoritesInternalResponse,
          bodyOf(await send('get', collection, actor)),
        );
        expect(current.items.map(({ targetId }) => targetId)).toEqual([space.id]);
        expect(await countRows('favorites', 'user_id = $2', actor.userId)).toBe(1);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled([cleanup, adding]);
        await inTenant(atelierNordId, async (client) => {
          await client.query('delete from favorites where organization_id = $1 and user_id = $2', [
            atelierNordId,
            actor.userId,
          ]);
          await client.query(
            'delete from organization_members where organization_id = $1 and user_id = $2',
            [atelierNordId, actor.userId],
          );
        });
      }
    });
  });

  describe('organizations never see each other', () => {
    it('serves each organization its own spaces, and lets both use the prefix CAD', async () => {
      const boutique = await createSpace(
        solene,
        { name: 'Boutique', prefix: 'CAD' },
        atelierDeltaId,
      );

      expect(boutique.space).toMatchObject({ prefix: 'CAD', nextKey: 'CAD-1' });
      expectProblem(
        await send('get', `/internal/v1/spaces/${produit.id}`, solene, {
          organizationId: atelierDeltaId,
        }),
        404,
        'space.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/spaces/${boutique.space.id}`, camille),
        404,
        'space.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/lists/${sprint14.id}`, solene, {
          organizationId: atelierDeltaId,
        }),
        404,
        'list.not-found',
      );
      const own = conforms(
        ListSpacesInternalResponse,
        bodyOf(
          await send('get', '/internal/v1/spaces', solene, { organizationId: atelierDeltaId }),
        ),
      );
      expect(own.items.map((space) => space.name)).toEqual(['Boutique']);
      // Camille is no member of the second organization, whatever token she holds.
      expectProblem(
        await send('get', '/internal/v1/spaces', camille, { organizationId: atelierDeltaId }),
        404,
        'organization.not-found',
      );
    });

    it('shows the second organization none of the rows of Atelier Nord in spaces, space_prefixes and lists', async () => {
      const organizationsSeen = async (table: string): Promise<readonly string[]> =>
        inTenant(atelierDeltaId, async (client) => {
          const result = await client.query(
            `select distinct organization_id::text as organization_id from ${table}`,
          );
          return (result.rows as readonly { readonly organization_id: string }[]).map(
            (row) => row.organization_id,
          );
        });

      expect(await organizationsSeen('spaces')).toEqual([atelierDeltaId]);
      expect(await organizationsSeen('space_prefixes')).toEqual([atelierDeltaId]);
      expect(await organizationsSeen('lists')).toEqual([atelierDeltaId]);
      const atelierNordRows = await inTenant(atelierDeltaId, async (client) => {
        const result = await client.query(
          `select
             (select count(*)::int from spaces where organization_id = $1) as spaces,
             (select count(*)::int from space_prefixes where organization_id = $1) as prefixes,
             (select count(*)::int from lists where organization_id = $1) as lists`,
          [atelierNordId],
        );
        return result.rows;
      });
      expect(atelierNordRows).toEqual([{ spaces: 0, prefixes: 0, lists: 0 }]);
    });

    it('refuses with 42501 a row of Atelier Nord written from a tenant transaction of the second organization', async () => {
      const writes: readonly {
        readonly table: string;
        readonly sql: string;
        readonly params: unknown[];
      }[] = [
        {
          table: 'spaces',
          sql: `insert into spaces (organization_id, name, prefix, color, visibility, owner_user_id, statuses)
                values ($1, 'Intrus', 'INT', 'gris', 'organization', $2, '{}'::jsonb)`,
          params: [atelierNordId, solene.userId],
        },
        {
          table: 'space_prefixes',
          sql: `insert into space_prefixes (organization_id, prefix, space_id) values ($1, 'INT', $2)`,
          params: [atelierNordId, produit.id],
        },
        {
          table: 'lists',
          sql: `insert into lists (organization_id, space_id, name, color)
                values ($1, $2, 'Intruse', 'gris')`,
          params: [atelierNordId, produit.id],
        },
      ];

      for (const write of writes) {
        await expect(
          inTenant(atelierDeltaId, (client) => client.query(write.sql, write.params)),
          write.table,
        ).rejects.toMatchObject({ code: '42501' });
      }
      expect(await countRows('spaces', `name = 'Intrus'`)).toBe(0);
    });
  });

  describe('when a member leaves, the private spaces they owned pass to the owner of the organization', () => {
    it('commits the removal of Hugo with the copy and the job only, shows his private spaces to nobody until the job runs, then hands them to Camille', async () => {
      studio = (await createSpace(hugo, { name: 'Studio', prefix: 'STU' })).space;
      maquettes = (await createSpace(hugo, { name: 'Maquettes', prefix: 'MAQ' })).space;
      const studioEvents = await outboxOf('spaceId', studio.id);
      const designVersion = (await readSpace(hugo, design.id)).version;
      const rechercheVersion = recherche.version;
      const rechercheEvents = await outboxOf('spaceId', recherche.id);
      const removal = toPublishedEvent('removed', atelierNordId, hugo, 'member', 2);

      // The first batch of the job waits on the held space past the lock timeout (5 s) and fails:
      // the window between the removal and the handover stays open while the row is held.
      await whileSpaceHeld(atelierNordId, recherche.id, async () => {
        await deliver(removal);

        expect(await removalState(atelierNordId, hugo.memberId, recherche.id, removal.id)).toEqual({
          ended: true,
          owner: hugo.userId,
          version: rechercheVersion,
          awaiting: false,
          processed: 1,
        });
        expect(await cleanUpJobsOf(atelierNordId, hugo)).toHaveLength(1);
        expect(await outboxOf('spaceId', recherche.id)).toHaveLength(rechercheEvents.length);
        for (const viewer of [camille, ines]) {
          for (const space of [recherche, design]) {
            expectProblem(
              await send('get', `/internal/v1/spaces/${space.id}`, viewer),
              404,
              'space.not-found',
            );
          }
          const listed = conforms(
            ListSpacesInternalResponse,
            bodyOf(await send('get', '/internal/v1/spaces?limit=100', viewer)),
          );
          expect(listed.items.map((space) => space.id)).not.toContain(recherche.id);
          expect(listed.items.map((space) => space.id)).not.toContain(design.id);
        }
        await cleanUpWaitingForRetry(atelierNordId, hugo);
        expect((await storedSpaceOf(atelierNordId, design.id)).owner).toBe(hugo.userId);
      });

      await cleanUpsCompleted(atelierNordId, hugo, 1);
      for (const handed of [recherche, design]) {
        const space = await readSpace(camille, handed.id);
        expect(space.owner).toEqual({ userId: camille.userId });
        expect(space.visibility).toBe('private');
      }
      expect(await readSpace(camille, studio.id)).toMatchObject({
        owner: { userId: hugo.userId },
        version: 1,
      });
      expect(await outboxOf('spaceId', studio.id)).toHaveLength(studioEvents.length);
      const listed = conforms(
        ListSpacesInternalResponse,
        bodyOf(await send('get', '/internal/v1/spaces?limit=100', camille)),
      );
      expect(listed.items.map((space) => space.id)).toEqual(
        expect.arrayContaining([recherche.id, design.id, studio.id]),
      );

      await vi.waitFor(async () => {
        const events = await outboxOf('spaceId', recherche.id);
        expect(events.at(-1)?.status).toBe('sent');
      }, waitOptions);
      const handover = (await outboxOf('spaceId', recherche.id)).at(-1);
      expect(conforms(taskEventSchemas['space.updated.v1'], handover?.payload)).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'system', id: 'task-service' },
        spaceId: recherche.id,
        ownerUserId: camille.userId,
        changed: ['ownerUserId'],
        version: rechercheVersion + 1,
      });
      expect((await readSpace(camille, design.id)).version).toBe(designVersion + 1);
    }, 240_000);

    it('answers a removed member as a stranger to the organization', async () => {
      expectProblem(await send('get', '/internal/v1/spaces', hugo), 404, 'organization.not-found');
    });

    it('gives a space to the owner of the organization when an admin makes private a space whose owner has left', async () => {
      const before = await readSpace(camille, studio.id);
      expect(before).toMatchObject({ visibility: 'organization', owner: { userId: hugo.userId } });

      const made = await send('patch', `/internal/v1/spaces/${studio.id}`, ines, {
        body: { visibility: 'private' },
      });

      expect(made.status).toBe(200);
      const after = conforms(UpdateSpaceInternalResponse, bodyOf(made));
      expect(after).toMatchObject({ visibility: 'private', owner: { userId: camille.userId } });
      expect(after.version).toBeGreaterThan(before.version);
      expect(await readSpace(camille, studio.id)).toMatchObject({
        visibility: 'private',
        owner: { userId: camille.userId },
        version: after.version,
      });
      expectProblem(
        await send('get', `/internal/v1/spaces/${studio.id}`, ines),
        404,
        'space.not-found',
      );
      await vi.waitFor(async () => {
        expect((await outboxOf('spaceId', studio.id)).at(-1)?.status).toBe('sent');
      }, waitOptions);
      const event = (await outboxOf('spaceId', studio.id)).at(-1);
      const payload = conforms(taskEventSchemas['space.updated.v1'], event?.payload);
      expect(payload).toMatchObject({
        actor: { type: 'user', id: ines.userId },
        visibility: 'private',
        ownerUserId: camille.userId,
        version: after.version,
      });
      expect(payload.changed).toEqual(expect.arrayContaining(['visibility', 'ownerUserId']));
    });

    // "Each change that changes something takes the next version": the handover that goes with a
    // change of visibility is part of that one change.
    it('takes one version, not two, for a change that also hands the space over', async () => {
      const before = await readSpace(camille, maquettes.id);

      const after = conforms(
        UpdateSpaceInternalResponse,
        bodyOf(
          await send('patch', `/internal/v1/spaces/${maquettes.id}`, ines, {
            body: { visibility: 'private' },
          }),
        ),
      );

      expect(after.version).toBe(before.version + 1);
    });

    it('leaves a person their private spaces when the removal of an old membership arrives after they joined again', async () => {
      const carnet = (
        await createSpace(lea, { name: 'Carnet', prefix: 'CRN', visibility: 'private' })
      ).space;
      const eventsBefore = await outboxOf('spaceId', carnet.id);

      await deliver(
        toPublishedEvent(
          'joined',
          atelierNordId,
          { userId: lea.userId, memberId: leaNewMemberId },
          'member',
          1,
        ),
      );
      await deliver(toPublishedEvent('removed', atelierNordId, lea, 'member', 2));
      await cleanUpsCompleted(atelierNordId, lea, 1);

      const oldMembership = await asSystem<{ readonly ended: boolean }>(
        `select removed_at is not null as ended from organization_members
          where organization_id = $1 and id = $2`,
        [atelierNordId, lea.memberId],
      );
      expect(oldMembership).toEqual([{ ended: true }]);
      expect(await readSpace(lea, carnet.id)).toMatchObject({
        owner: { userId: lea.userId },
        version: 1,
      });
      expectProblem(
        await send('get', `/internal/v1/spaces/${carnet.id}`, camille),
        404,
        'space.not-found',
      );
      expect(await outboxOf('spaceId', carnet.id)).toHaveLength(eventsBefore.length);
    });
  });

  describe('a removal that has no private space to hand over needs no owner of the organization', () => {
    it('applies the removal of a member on its first delivery though the owner has not joined', async () => {
      await deliver(toPublishedEvent('joined', maisonVerteId, elise, 'member', 1));
      const space = await createSpace(elise, { name: 'Cuisine', prefix: 'CUI' }, maisonVerteId);
      const removal = toPublishedEvent('removed', maisonVerteId, elise, 'member', 2);
      const redelivered = consumerInfo('project-member-removed').num_redelivered;

      await deliver(removal);
      await cleanUpsCompleted(maisonVerteId, elise, 1);

      const [membership] = await asSystem<{ readonly ended: boolean }>(
        `select removed_at is not null as ended from organization_members
          where organization_id = $1 and id = $2`,
        [maisonVerteId, elise.memberId],
      );
      const processed = await asSystem<{ readonly total: number }>(
        `select count(*)::int as total from processed_events
          where consumer = 'task-service__project-member-removed' and event_id = $1`,
        [removal.id],
      );
      const [owner] = await asSystem<{ readonly owner: string; readonly version: number }>(
        `select owner_user_id::text as owner, version from spaces
          where organization_id = $1 and id = $2`,
        [maisonVerteId, space.space.id],
      );
      expect(membership).toEqual({ ended: true });
      expect(processed).toEqual([{ total: 1 }]);
      expect(owner).toEqual({ owner: elise.userId, version: 1 });
      const info = consumerInfo('project-member-removed');
      expect(info.num_redelivered).toBe(redelivered);
      expect(info.num_ack_pending).toBe(0);
    });
  });

  describe('values the database cannot store are refused at the boundary', () => {
    it('refuses a space name that holds U+0000 with 400 request.invalid, on creation and on change', async () => {
      const before = await countRows('spaces', 'true');

      const created = await send('post', '/internal/v1/spaces', camille, {
        body: { name: 'Pro\u0000duit', prefix: 'NUL' },
      });
      const changed = await send('patch', `/internal/v1/spaces/${produit.id}`, camille, {
        body: { name: 'Pro\u0000duit' },
      });

      expectProblem(created, 400, 'request.invalid');
      expectProblem(changed, 400, 'request.invalid');
      expect(await countRows('spaces', 'true')).toBe(before);
      expect(await countRows('space_prefixes', `prefix = 'NUL'`)).toBe(0);
    });

    it('refuses a sprint that starts in the year 0000 with 400 request.invalid, on creation and on change', async () => {
      const before = await countRows('lists', 'space_id = $2', produit.id);

      const created = await send('post', `/internal/v1/spaces/${produit.id}/lists`, camille, {
        body: { name: 'Sprint 0', sprint: { startDate: '0000-01-01', endDate: '2026-11-17' } },
      });
      const changed = await send('patch', `/internal/v1/lists/${sprint14.id}`, camille, {
        body: { sprint: { startDate: '0000-01-01', endDate: '2026-11-17' } },
      });

      expectProblem(created, 400, 'request.invalid');
      expectProblem(changed, 400, 'request.invalid');
      expect(await countRows('lists', 'space_id = $2', produit.id)).toBe(before);
    });
  });

  describe('the ids of the token are read in lower case', () => {
    it('treats an actor and an organization in upper case as Camille of Atelier Nord, owner of her private space', async () => {
      const direction = (
        await createSpace(camille, { name: 'Direction', prefix: 'DIR', visibility: 'private' })
      ).space;
      const upper = { userId: camille.userId.toUpperCase() };

      const read = await send('get', `/internal/v1/spaces/${direction.id}`, upper);
      const readInUpperOrganization = await send(
        'get',
        `/internal/v1/spaces/${direction.id}`,
        upper,
        { organizationId: atelierNordId.toUpperCase() },
      );
      const created = await send('post', '/internal/v1/spaces', upper, {
        body: { name: 'Juridique', prefix: 'JUR' },
      });

      expect(read.status).toBe(200);
      expect(conforms(GetSpaceInternalResponse, bodyOf(read)).owner).toEqual({
        userId: camille.userId,
      });
      expect(readInUpperOrganization.status).toBe(200);
      expect(created.status).toBe(201);
      expect(conforms(CreateSpaceInternalResponse, bodyOf(created)).space.owner).toEqual({
        userId: camille.userId,
      });
    });

    it('refuses an actor id that is not a UUID with 403 auth.actor-not-allowed', async () => {
      const response = await send('get', '/internal/v1/spaces', { userId: 'camille-martin' });

      expectProblem(response, 403, 'auth.actor-not-allowed');
    });
  });

  /**
   * Reads who owns a space and whether it awaits an owner, whoever may see it.
   *
   * @param organizationId - Organization of the space.
   * @param spaceId - The space.
   * @returns The owner, the version and the awaiting flag.
   */
  async function storedSpaceOf(
    organizationId: string,
    spaceId: string,
  ): Promise<{ readonly owner: string; readonly version: number; readonly awaiting: boolean }> {
    const [row] = await asSystem<{
      readonly owner: string;
      readonly version: number;
      readonly awaiting: boolean;
    }>(
      `select owner_user_id::text as owner, version, awaiting_owner as awaiting
         from spaces where organization_id = $1 and id = $2`,
      [organizationId, spaceId],
    );
    if (row === undefined) {
      throw new Error('The space could not be read.');
    }
    return row;
  }

  /**
   * Reads what the database holds of a removal and of the space it concerns, whoever may see them.
   *
   * @param organizationId - Organization of the rows.
   * @param memberId - Membership of the leaver.
   * @param spaceId - A private space the leaver owned.
   * @param eventId - Id of the removal event.
   * @returns Whether the membership ended, the space, and how many times the event is recorded.
   */
  async function removalState(
    organizationId: string,
    memberId: string,
    spaceId: string,
    eventId: string,
  ): Promise<{
    readonly ended: boolean;
    readonly owner: string;
    readonly version: number;
    readonly awaiting: boolean;
    readonly processed: number;
  }> {
    const [row] = await asSystem<{
      readonly ended: boolean;
      readonly owner: string;
      readonly version: number;
      readonly awaiting: boolean;
      readonly processed: number;
    }>(
      `select
         (select removed_at is not null from organization_members
           where organization_id = $1 and id = $2) as ended,
         (select owner_user_id::text from spaces where organization_id = $1 and id = $3) as owner,
         (select version from spaces where organization_id = $1 and id = $3) as version,
         (select awaiting_owner from spaces where organization_id = $1 and id = $3) as awaiting,
         (select count(*)::int from processed_events
           where consumer = 'task-service__project-member-removed' and event_id = $4) as processed`,
      [organizationId, memberId, spaceId, eventId],
    );
    if (row === undefined) {
      throw new Error('The state of the removal could not be read.');
    }
    return row;
  }

  describe('a removal always commits, also when the owner of the organization is not known yet', () => {
    let brouillon: SpaceBody;
    let brouillonFirstListId = '';

    it('applies the removal on its first delivery and keeps the private spaces of the leaver out of sight of everybody', async () => {
      await deliver(toPublishedEvent('joined', studioLumenId, mathis, 'member', 1));
      await deliver(toPublishedEvent('joined', studioLumenId, chloe, 'member', 1));
      const created = await createSpace(
        mathis,
        { name: 'Brouillon', prefix: 'BRL', visibility: 'private' },
        studioLumenId,
      );
      brouillon = created.space;
      brouillonFirstListId = created.firstList.id;
      const removal = toPublishedEvent('removed', studioLumenId, mathis, 'member', 2);
      const redelivered = consumerInfo('project-member-removed').num_redelivered;

      // `deliver` returns once the consumer acknowledged everything it delivered; the job marks
      // the space awaiting an owner afterwards.
      await deliver(removal);
      await cleanUpsCompleted(studioLumenId, mathis, 1);

      expect(consumerInfo('project-member-removed').num_redelivered).toBe(redelivered);
      expect(await removalState(studioLumenId, mathis.memberId, brouillon.id, removal.id)).toEqual({
        ended: true,
        owner: mathis.userId,
        version: 1,
        awaiting: true,
        processed: 1,
      });
      expect((await outboxOf('spaceId', brouillon.id)).map((event) => event.event_name)).toEqual([
        'space.created.v1',
        'list.created.v1',
      ]);
    });

    it('shows a space that awaits its owner to nobody, not even to the former owner who joins again', async () => {
      const asMember = { organizationId: studioLumenId };
      expectProblem(
        await send('get', `/internal/v1/spaces/${brouillon.id}`, mathis, asMember),
        404,
        'organization.not-found',
      );
      await deliver(
        toPublishedEvent(
          'joined',
          studioLumenId,
          { userId: mathis.userId, memberId: mathisNewMemberId },
          'member',
          1,
        ),
      );

      for (const viewer of [chloe, mathis]) {
        expectProblem(
          await send('get', `/internal/v1/spaces/${brouillon.id}`, viewer, asMember),
          404,
          'space.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/spaces/${brouillon.id}/lists`, viewer, asMember),
          404,
          'space.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/lists/${brouillonFirstListId}`, viewer, asMember),
          404,
          'list.not-found',
        );
      }
      // The former owner joined again as a member while the owner of the organization is unknown:
      // the space is still left out of the list, though the account is recorded as its owner.
      for (const viewer of [chloe, mathis]) {
        const listed = await send('get', '/internal/v1/spaces?limit=100', viewer, asMember);
        expect(listed.status).toBe(200);
        expect(
          conforms(ListSpacesInternalResponse, bodyOf(listed)).items.map((space) => space.id),
        ).not.toContain(brouillon.id);
      }
      expect(await storedSpaceOf(studioLumenId, brouillon.id)).toMatchObject({
        owner: mathis.userId,
        awaiting: true,
      });
    });

    it('passes every space that awaits an owner to him in the transaction of the event that makes him the owner', async () => {
      await deliver(toPublishedEvent('joined', studioLumenId, anais, 'owner', 1));

      expect(await storedSpaceOf(studioLumenId, brouillon.id)).toEqual({
        owner: anais.userId,
        version: 2,
        awaiting: false,
      });
      const handed = await send('get', `/internal/v1/spaces/${brouillon.id}`, anais, {
        organizationId: studioLumenId,
      });
      expect(handed.status).toBe(200);
      expect(conforms(GetSpaceInternalResponse, bodyOf(handed))).toMatchObject({
        owner: { userId: anais.userId },
        visibility: 'private',
        version: 2,
      });
      for (const viewer of [chloe, mathis]) {
        expectProblem(
          await send('get', `/internal/v1/spaces/${brouillon.id}`, viewer, {
            organizationId: studioLumenId,
          }),
          404,
          'space.not-found',
        );
      }
      await vi.waitFor(async () => {
        expect((await outboxOf('spaceId', brouillon.id)).at(-1)?.status).toBe('sent');
      }, waitOptions);
      const events = await outboxOf('spaceId', brouillon.id);
      expect(events.map((event) => event.event_name)).toEqual([
        'space.created.v1',
        'list.created.v1',
        'space.updated.v1',
      ]);
      expect(conforms(taskEventSchemas['space.updated.v1'], events[2]?.payload)).toMatchObject({
        organizationId: studioLumenId,
        actor: { type: 'system', id: 'task-service' },
        spaceId: brouillon.id,
        ownerUserId: anais.userId,
        changed: ['ownerUserId'],
        version: 2,
      });
    });

    it('passes the spaces that await an owner to the member whom a role change makes the owner', async () => {
      await deliver(toPublishedEvent('joined', maisonVerteId, theo, 'member', 1));
      await deliver(toPublishedEvent('joined', maisonVerteId, jeanne, 'admin', 1));
      const atelier = (
        await createSpace(
          theo,
          { name: 'Atelier', prefix: 'ATL', visibility: 'private' },
          maisonVerteId,
        )
      ).space;
      const removal = toPublishedEvent('removed', maisonVerteId, theo, 'member', 2);

      await deliver(removal);
      await cleanUpsCompleted(maisonVerteId, theo, 1);

      expect(await removalState(maisonVerteId, theo.memberId, atelier.id, removal.id)).toEqual({
        ended: true,
        owner: theo.userId,
        version: 1,
        awaiting: true,
        processed: 1,
      });
      expectProblem(
        await send('get', `/internal/v1/spaces/${atelier.id}`, jeanne, {
          organizationId: maisonVerteId,
        }),
        404,
        'space.not-found',
      );

      await deliver(toPublishedEvent('role-changed', maisonVerteId, jeanne, 'owner', 2, 'admin'));

      expect(await storedSpaceOf(maisonVerteId, atelier.id)).toEqual({
        owner: jeanne.userId,
        version: 2,
        awaiting: false,
      });
      const handed = await send('get', `/internal/v1/spaces/${atelier.id}`, jeanne, {
        organizationId: maisonVerteId,
      });
      expect(handed.status).toBe(200);
      expect(conforms(GetSpaceInternalResponse, bodyOf(handed)).owner).toEqual({
        userId: jeanne.userId,
      });
      await vi.waitFor(async () => {
        expect((await outboxOf('spaceId', atelier.id)).at(-1)?.status).toBe('sent');
      }, waitOptions);
      expect(
        conforms(
          taskEventSchemas['space.updated.v1'],
          (await outboxOf('spaceId', atelier.id)).at(-1)?.payload,
        ),
      ).toMatchObject({
        actor: { type: 'system', id: 'task-service' },
        ownerUserId: jeanne.userId,
        changed: ['ownerUserId'],
        version: 2,
      });
    });
  });

  // Last: the job of this test fails on a lock and is retried by pg-boss after its backoff.
  describe('a removal commits at once while a lock holds a private space, and only the failed batch of its job is retried', () => {
    it('ends the membership of Noé on the first delivery, keeps his space as it was while the job fails, then hands it to Anaïs on the retry', async () => {
      await deliver(toPublishedEvent('joined', studioLumenId, noe, 'member', 1));
      const carnet = (
        await createSpace(
          noe,
          { name: 'Carnet de route', prefix: 'CDR', visibility: 'private' },
          studioLumenId,
        )
      ).space;
      const removal = toPublishedEvent('removed', studioLumenId, noe, 'member', 2);
      const redelivered = consumerInfo('project-member-removed').num_redelivered;

      await whileSpaceHeld(studioLumenId, carnet.id, async () => {
        await deliver(removal);

        expect(consumerInfo('project-member-removed').num_redelivered).toBe(redelivered);
        expect(await removalState(studioLumenId, noe.memberId, carnet.id, removal.id)).toEqual({
          ended: true,
          owner: noe.userId,
          version: 1,
          awaiting: false,
          processed: 1,
        });
        await cleanUpWaitingForRetry(studioLumenId, noe);
        expect((await outboxOf('spaceId', carnet.id)).map((event) => event.event_name)).toEqual([
          'space.created.v1',
          'list.created.v1',
        ]);
        expectProblem(
          await send('get', `/internal/v1/spaces/${carnet.id}`, anais, {
            organizationId: studioLumenId,
          }),
          404,
          'space.not-found',
        );
      });

      const [job] = await cleanUpsCompleted(studioLumenId, noe, 1);
      expect(job?.retry_count).toBeGreaterThanOrEqual(1);
      expect(await removalState(studioLumenId, noe.memberId, carnet.id, removal.id)).toEqual({
        ended: true,
        owner: anais.userId,
        version: 2,
        awaiting: false,
        processed: 1,
      });
      const handed = await send('get', `/internal/v1/spaces/${carnet.id}`, anais, {
        organizationId: studioLumenId,
      });
      expect(handed.status).toBe(200);
      expect(conforms(GetSpaceInternalResponse, bodyOf(handed)).owner).toEqual({
        userId: anais.userId,
      });
      await vi.waitFor(async () => {
        expect((await outboxOf('spaceId', carnet.id)).at(-1)?.status).toBe('sent');
      }, waitOptions);
      expect(
        conforms(
          taskEventSchemas['space.updated.v1'],
          (await outboxOf('spaceId', carnet.id)).at(-1)?.payload,
        ),
      ).toMatchObject({
        organizationId: studioLumenId,
        actor: { type: 'system', id: 'task-service' },
        changed: ['ownerUserId'],
        ownerUserId: anais.userId,
        version: 2,
      });
    }, 240_000);
  });
});
