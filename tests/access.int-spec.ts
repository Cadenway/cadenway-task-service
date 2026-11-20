import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { eventSchemas as taskEventSchemas } from '@cadenway/contracts/events/task-service';
import type {
  MemberJoinedV1,
  MemberRemovedV1,
  MemberRoleChangedV1,
} from '@cadenway/contracts/events/organization-service';
import {
  AddChecklistItemInternalResponse,
  ApproveAccessRequestInternalResponse,
  CheckListAccessInternalResponse,
  CheckTaskAccessInternalResponse,
  CreateListInternalResponse,
  CreateSpaceInternalResponse,
  CreateTaskInternalResponse,
  GetHomeInternalResponse,
  GetListCountsInternalResponse,
  GetListInternalResponse,
  GetSpaceInternalResponse,
  GetSpaceOverviewInternalResponse,
  GetTaskDetailInternalResponse,
  GetTaskInternalResponse,
  ListAccessRequestsInternalResponse,
  ListLabelsInternalResponse,
  ListListActivityInternalResponse,
  ListListGrantsInternalResponse,
  ListListsInternalResponse,
  ListMyTasksInternalResponse,
  ListSpaceGrantsInternalResponse,
  ListSpacesInternalResponse,
  ListSubtasksInternalResponse,
  ListTaskActivityInternalResponse,
  ListTasksInternalResponse,
  RefuseAccessRequestInternalResponse,
  SetListGrantInternalResponse,
  SetSpaceGrantInternalResponse,
  UpdateListInternalResponse,
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
import type { TransactionClient, TransactionDatabase } from '@cadenway/nest-common/database';
import { startTelemetry } from '@cadenway/nest-common/telemetry';
import type { TelemetryHandle } from '@cadenway/nest-common/telemetry';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import { DrizzleAccessRequestRepository } from '../src/modules/access-requests/infrastructure/persistence/drizzle/repositories/access-request/drizzle-access-request.repository.js';
import { DrizzleRequestAttemptRepository } from '../src/modules/access-requests/infrastructure/persistence/drizzle/repositories/attempt/drizzle-request-attempt.repository.js';
import type { CleanUpRemovedMemberInput } from '../src/modules/member-lifecycle/application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.input.js';
import type { CleanUpRemovedMemberOutput } from '../src/modules/member-lifecycle/application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.output.js';
import { CleanUpRemovedMember } from '../src/modules/member-lifecycle/application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.use-case.js';
import type { GrantedResource } from '../src/modules/spaces/application/models/access/granted-resource.model.js';
import { DrizzleGrantRepository } from '../src/modules/spaces/infrastructure/persistence/drizzle/repositories/access/drizzle-grant.repository.js';
import { DrizzleTaskListRepository } from '../src/modules/spaces/infrastructure/persistence/drizzle/repositories/list/drizzle-task-list.repository.js';
import { DrizzleSpaceRepository } from '../src/modules/spaces/infrastructure/persistence/drizzle/repositories/space/drizzle-space.repository.js';
import { ListManagedAccessTargets } from '../src/modules/spaces/public/access/list-managed-access-targets.js';
import type { ListManagedAccessTargetsOutput } from '../src/modules/spaces/public/access/list-managed-access-targets.js';
import { ListVisibleListIds } from '../src/modules/spaces/public/list/list-visible-list-ids.js';
import type { ListVisibleListIdsOutput } from '../src/modules/spaces/public/list/list-visible-list-ids.js';
import { assignedPageStatement } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/assignee/assigned-task-statements.mapper.js';
import {
  homeStatsStatement,
  stateCountsStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/count/task-counts.mapper.js';
import { labelPageStatement } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/label/label-statements.mapper.js';
import { DrizzleActivityRepository } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/activity/drizzle-activity.repository.js';

// The access model of P3b-1 on a disposable PostgreSQL and NATS: the grants of spaces and lists,
// the switch "Accès de l’organisation", the effective role on every route of P3a, the access
// requests, the access checks of the realtime gateway, row-level security of the four new tables,
// the clean-up of the grants of a member who left, and the query plans of the new statements on a
// realistic volume. The service runs as main.ts assembles it (the `task_app` role, the `task` NATS
// user), started from compose.dev.yaml as a throwaway Compose project on free ports, as
// tests/spaces.int-spec.ts does. The members come from the copy of the memberships, fed the way
// organization-service feeds it: member events published to `EVENTS` with the `admin` user of the
// `nats-streams` container. The routes are called with internal tokens of two trusted issuers, the
// API gateway and the realtime gateway, each with its own key pair, and their answers are checked
// against the validators generated from `openapi/internal/task-service.yaml`; the outbox rows are
// checked against the schemas of `asyncapi/task-service.yaml`. Rows are read and seeded as the
// migrator role with the system access of the policies, since row-level security is forced on every
// table. The OpenTelemetry SDK of the kit runs as `src/telemetry.ts` starts it, without an exporter,
// so that the rows the clean-up job appends carry the trace of the removal. The scenarios run in the
// order of the file and pass their state on.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-access-test-${String(process.pid)}`;

/** How long the copy, the relay or the broker may take to follow a change. */
const waitOptions = { timeout: 15_000, interval: 200 } as const;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** A second organization, with its own owner, which must never meet a row of Atelier Nord. */
const atelierDeltaId = '01938f6e-0000-7000-8000-000000000002';

/** The date of the scenarios, inside Sprint 14. */
const today = '2026-11-08';

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

/** Mathis Roux, member of Atelier Nord, whom a role change makes a guest. */
const mathis: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2a',
  memberId: '01938f6e-9000-7000-8000-0000000000c8',
};

/** Chloé Girard, member of Atelier Nord, who becomes a guest while her request waits. */
const chloe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2d',
  memberId: '01938f6e-9000-7000-8000-0000000000cc',
};

/** Noé Perrin, member of Atelier Nord, removed while his request waits for an answer. */
const noe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2e',
  memberId: '01938f6e-9000-7000-8000-0000000000d1',
};

/** Solène Garnier, owner of the second organization. */
const solene: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c29',
  memberId: '01938f6e-9000-7000-8000-0000000000c7',
};

/** The membership Léa Petit gets when she joins Atelier Nord again after her removal. */
const leaSecondMemberId = '01938f6e-9000-7000-8000-0000000000ca';

/** The membership Léa Petit gets when she joins again while her second removal is cleaned up. */
const leaThirdMemberId = '01938f6e-9000-7000-8000-0000000000cd';

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
  readonly num_pending: number;
}

/** A row of `outbox_events`, as the specs read it. */
interface OutboxRow {
  readonly id: string;
  readonly event_name: string;
  readonly payload: unknown;
}

/** The issuers the service trusts. */
type Issuer = 'api-gateway' | 'realtime-gateway';

/** A space, as the routes answer it. */
type SpaceBody = z.output<typeof GetSpaceInternalResponse>;

/** A list or a sprint, as the routes answer it. */
type ListBody = z.output<typeof GetListInternalResponse>;

/** A task, as the routes answer it. */
type TaskBody = z.output<typeof GetTaskInternalResponse>;

/** A grant, as the routes answer it. */
type GrantBody = z.output<typeof SetSpaceGrantInternalResponse>;

/** An access request, as the routes answer it. */
type AccessRequestBody = z.output<typeof ApproveAccessRequestInternalResponse>;

/** A role of a grant. */
type Role = 'edit' | 'comment' | 'view';

/** HTTP verbs the spec uses. */
type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** What a call adds to its path. */
interface SendOptions {
  readonly organizationId?: string;
  readonly body?: object;
  readonly headers?: Readonly<Record<string, string>>;
  readonly issuer?: Issuer;
}

/** The members of a space the routes answered in P3a, before grants existed. */
const p3aSpaceMembers: readonly string[] = [
  'id',
  'name',
  'prefix',
  'description',
  'icon',
  'color',
  'visibility',
  'owner',
  'statuses',
  'nextKey',
  'createdAt',
  'version',
];

/** The members of a list the routes answered in P3a, before grants existed. */
const p3aListMembers: readonly string[] = [
  'id',
  'spaceId',
  'name',
  'icon',
  'color',
  'sprint',
  'createdAt',
  'version',
];

/** The four tables P3b-1 adds, which no plan may scan whole. */
const accessTables: readonly string[] = [
  'space_grants',
  'list_grants',
  'access_requests',
  'access_request_attempts',
];

/** The tables of the tasks the cross-list statements read. */
const taskTables: readonly string[] = [
  'tasks',
  'task_assignees',
  'task_labels',
  'activity_entries',
];

/** A node of a plan of `EXPLAIN (FORMAT JSON)`. */
interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly 'Index Name'?: string;
  readonly 'Shared Hit Blocks'?: number;
  readonly 'Shared Read Blocks'?: number;
  readonly 'Actual Rows'?: number;
  readonly Plans?: readonly PlanNode[];
}

/** The document `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` returns for one statement. */
interface PlanDocument {
  readonly Plan: PlanNode;
  readonly 'Execution Time': number;
}

/** What the report keeps of one plan. */
interface PlanLine {
  readonly label: string;
  readonly nodes: readonly string[];
  readonly indexes: readonly string[];
  readonly seqScans: readonly string[];
  readonly blocks: number;
  readonly milliseconds: number;
  readonly rows: number;
}

/** A statement the repositories sent, as the Drizzle logger saw it. */
interface CapturedStatement {
  readonly sql: string;
  readonly params: unknown[];
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
 * Checks that every space and every list in an answer carries the access of the caller, which the
 * contract declares optional and this service always answers: `callerRole` (a role, or `null` for
 * a space seen through some of its lists only) and `callerCanManage` on a space,
 * `organizationAccess` and `callerRole` on a list. A space is an object with `statuses` and
 * `nextKey`, a list one with `spaceId`, `color` and `sprint`.
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
 * The median of measures.
 *
 * @param values - The measures, at least one.
 * @returns Their median.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Walks a plan.
 *
 * @param node - The root of the plan.
 * @param visit - Called with every node, the parents first.
 */
function visitPlan(node: PlanNode, visit: (node: PlanNode) => void): void {
  visit(node);
  for (const child of node.Plans ?? []) {
    visitPlan(child, visit);
  }
}

/**
 * Summarizes the plan `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` returned.
 *
 * @param label - What the statement is.
 * @param document - The first member of the JSON the statement returned.
 * @returns What the report keeps.
 */
function summarize(label: string, document: PlanDocument): PlanLine {
  const nodes: string[] = [];
  const indexes = new Set<string>();
  const seqScans: string[] = [];
  visitPlan(document.Plan, (node) => {
    const relation = node['Relation Name'];
    const index = node['Index Name'];
    nodes.push(
      index === undefined
        ? `${node['Node Type']}${relation === undefined ? '' : ` ${relation}`}`
        : `${node['Node Type']} ${index}`,
    );
    if (index !== undefined) {
      indexes.add(index);
    }
    if (node['Node Type'].includes('Seq Scan') && relation !== undefined) {
      seqScans.push(relation);
    }
  });
  return {
    label,
    nodes,
    indexes: [...indexes],
    seqScans,
    blocks: (document.Plan['Shared Hit Blocks'] ?? 0) + (document.Plan['Shared Read Blocks'] ?? 0),
    milliseconds: Math.round(document['Execution Time'] * 1000) / 1000,
    rows: document.Plan['Actual Rows'] ?? 0,
  };
}

describe('the access model: grants, the switch, the effective role and access requests', () => {
  const apiGateway = keyPair('test-api-gateway');
  const realtimeGateway = keyPair('test-realtime-gateway');
  let app: NestExpressApplication | undefined;
  const signers = new Map<Issuer, InternalTokenSigner>();
  let migrator: pg.Pool;
  let application: pg.Pool;
  let telemetry: TelemetryHandle | undefined;

  // State the scenarios pass on, in the order of the file.
  let produit: SpaceBody;
  let produitFirstList: ListBody;
  let recherche: SpaceBody;
  let rechercheFirstList: ListBody;
  let direction: SpaceBody;
  let directionList: ListBody;
  let communaute: SpaceBody;
  let communauteFirstList: ListBody;
  let carnet: SpaceBody;
  let sprint14: ListBody;
  let backlog: ListBody;
  let entretiens: ListBody;
  let budget: ListBody;
  let recrutement: ListBody;
  let budgetTask: TaskBody;
  let entretiensTask: TaskBody;
  let directionTask: TaskBody;
  let demoTask: TaskBody;
  let calendarTask: TaskBody;
  let checklistItemId = '';
  const requests = new Map<string, string>();

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
   * Signs an internal token for an actor, as an issuer.
   *
   * @param actor - The account the issuer acts for.
   * @param options - The issuer (the API gateway by default) and the organization.
   * @returns The token.
   */
  async function tokenFor(
    actor: { readonly userId: string },
    options: SendOptions,
  ): Promise<string> {
    const signer = signers.get(options.issuer ?? 'api-gateway');
    if (signer === undefined) {
      throw new Error('No signer for the issuer.');
    }
    return signer.sign('task-service', {
      actor: { type: 'user', id: actor.userId },
      organizationId: options.organizationId ?? atelierNordId,
    });
  }

  /**
   * Builds a call of a route of the service with a token.
   *
   * @param method - HTTP verb.
   * @param path - Path of the route, with its query.
   * @param token - The internal token.
   * @param options - Body and headers.
   * @returns The call, to await.
   */
  function build(
    method: HttpMethod,
    path: string,
    token: string,
    options: SendOptions,
  ): request.Test {
    let call = request(service().getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${token}`);
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      call = call.set(name, value);
    }
    if (options.body !== undefined) {
      call = call.send(options.body);
    }
    return call;
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
    const token = await tokenFor(actor, options);
    const response = await build(method, path, token, options);
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
    table:
      | 'space_grants'
      | 'list_grants'
      | 'access_requests'
      | 'access_request_attempts'
      | 'task_assignees',
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
   * Reads the outbox rows whose payload names an id, oldest first (ids come from `uuidv7()`).
   *
   * @param member - The member of the payload that holds the id.
   * @param id - The id.
   * @returns The rows.
   */
  async function outboxOf(
    member: 'spaceId' | 'listId' | 'accessRequestId',
    id: string,
  ): Promise<OutboxRow[]> {
    return asSystem<OutboxRow>(
      `select id::text as id, event_name, payload from outbox_events
        where payload ->> '${member}' = $1 order by id`,
      [id],
    );
  }

  /**
   * Reads the outbox rows appended after a known row, oldest first.
   *
   * @param member - The member of the payload that holds the id.
   * @param id - The id.
   * @param before - How many rows of that id there were before.
   * @returns The rows appended since.
   */
  async function outboxSince(
    member: 'spaceId' | 'listId' | 'accessRequestId',
    id: string,
    before: number,
  ): Promise<OutboxRow[]> {
    return (await outboxOf(member, id)).slice(before);
  }

  /**
   * Forgets the attempts of access requests of people, as an hour passing would.
   *
   * @param people - The requesters.
   */
  async function forgetAttempts(...people: readonly Person[]): Promise<void> {
    await asSystem(
      `delete from access_request_attempts where organization_id = $1 and user_id = any($2::uuid[])`,
      [atelierNordId, people.map((person) => person.userId)],
    );
  }

  /**
   * Calls a read route, checks `200` and the answer against the contract.
   *
   * @param schema - The validator of the answer.
   * @param path - Path of the route, with its query.
   * @param actor - Who reads.
   * @returns The answer.
   */
  async function read<TSchema extends z.ZodType>(
    schema: TSchema,
    path: string,
    actor: Person,
  ): Promise<z.output<TSchema>> {
    const response = await send('get', path, actor);
    expect(response.status, `GET ${path}`).toBe(200);
    const body = conforms(schema, bodyOf(response));
    expectAccessMembers(body);
    return body;
  }

  /**
   * Reads a space as a member and checks the answer against the contract.
   *
   * @param actor - Who reads.
   * @param spaceId - The space.
   * @returns The space.
   */
  async function readSpace(actor: Person, spaceId: string): Promise<SpaceBody> {
    return read(GetSpaceInternalResponse, `/internal/v1/spaces/${spaceId}`, actor);
  }

  /**
   * Reads a list as a member and checks the answer against the contract.
   *
   * @param actor - Who reads.
   * @param listId - The list.
   * @returns The list.
   */
  async function readList(actor: Person, listId: string): Promise<ListBody> {
    return read(GetListInternalResponse, `/internal/v1/lists/${listId}`, actor);
  }

  /**
   * Lists the spaces a member sees.
   *
   * @param actor - Who reads.
   * @returns The spaces of the first page of 100.
   */
  async function spacesSeenBy(actor: Person): Promise<SpaceBody[]> {
    return (await read(ListSpacesInternalResponse, '/internal/v1/spaces?limit=100', actor)).items;
  }

  /**
   * Lists the lists of a space a member has a role on.
   *
   * @param actor - Who reads.
   * @param spaceId - The space.
   * @returns The lists of the first page of 100.
   */
  async function listsSeenBy(actor: Person, spaceId: string): Promise<ListBody[]> {
    return (
      await read(ListListsInternalResponse, `/internal/v1/spaces/${spaceId}/lists?limit=100`, actor)
    ).items;
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
    const created = conforms(CreateSpaceInternalResponse, bodyOf(response));
    expectAccessMembers(created);
    return created;
  }

  /**
   * Creates a list in a space as a member and checks the answer against the contract.
   *
   * @param actor - Who creates.
   * @param spaceId - The space.
   * @param body - The list.
   * @returns The list.
   */
  async function createList(actor: Person, spaceId: string, body: object): Promise<ListBody> {
    const response = await send('post', `/internal/v1/spaces/${spaceId}/lists`, actor, { body });
    expect(response.status).toBe(201);
    const list = conforms(CreateListInternalResponse, bodyOf(response));
    expectAccessMembers(list);
    return list;
  }

  /**
   * Creates a task in a list as a member and checks the answer against the contract.
   *
   * @param actor - Who creates.
   * @param listId - The list.
   * @param body - The task.
   * @returns The task.
   */
  async function createTask(actor: Person, listId: string, body: object): Promise<TaskBody> {
    const response = await send('post', `/internal/v1/lists/${listId}/tasks`, actor, { body });
    expect(response.status).toBe(201);
    return conforms(CreateTaskInternalResponse, bodyOf(response));
  }

  /**
   * Gives or changes a grant through its route.
   *
   * @param actor - Who gives it.
   * @param resource - `spaces` or `lists`.
   * @param resourceId - The space or the list.
   * @param userId - The person given access.
   * @param role - The role.
   * @param headers - Extra headers, `If-Match` for instance.
   * @returns The response.
   */
  async function putGrant(
    actor: Person,
    resource: 'spaces' | 'lists',
    resourceId: string,
    userId: string,
    role: Role,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<request.Response> {
    return send('put', `/internal/v1/${resource}/${resourceId}/grants/${userId}`, actor, {
      body: { role },
      headers,
    });
  }

  /**
   * Gives or changes a grant and checks `200` and the answer against the contract.
   *
   * @param actor - Who gives it.
   * @param resource - `spaces` or `lists`.
   * @param resourceId - The space or the list.
   * @param userId - The person given access.
   * @param role - The role.
   * @returns The grant and the ETag.
   */
  async function grant(
    actor: Person,
    resource: 'spaces' | 'lists',
    resourceId: string,
    userId: string,
    role: Role,
  ): Promise<{ readonly grant: GrantBody; readonly etag: string }> {
    const response = await putGrant(actor, resource, resourceId, userId, role);
    expect(response.status, `PUT ${resource} grant`).toBe(200);
    const body = conforms(
      resource === 'spaces' ? SetSpaceGrantInternalResponse : SetListGrantInternalResponse,
      bodyOf(response),
    );
    return { grant: body, etag: String(response.headers.etag) };
  }

  /**
   * Removes a grant through its route.
   *
   * @param actor - Who removes it.
   * @param resource - `spaces` or `lists`.
   * @param resourceId - The space or the list.
   * @param userId - The person.
   * @param headers - Extra headers, `If-Match` for instance.
   * @returns The response.
   */
  async function removeGrant(
    actor: Person,
    resource: 'spaces' | 'lists',
    resourceId: string,
    userId: string,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<request.Response> {
    return send('delete', `/internal/v1/${resource}/${resourceId}/grants/${userId}`, actor, {
      headers,
    });
  }

  /**
   * Asks for access and checks the answer, `202` with an empty body.
   *
   * @param actor - The requester.
   * @param body - The request.
   * @returns The response.
   */
  async function ask(actor: Person, body: object): Promise<request.Response> {
    const response = await send('post', '/internal/v1/access-requests', actor, { body });
    expect(response.status, JSON.stringify(body)).toBe(202);
    expect(response.text).toBe('');
    return response;
  }

  /**
   * Reads the id of the pending request of a requester for a target.
   *
   * @param requester - The requester.
   * @param target - `space`, `list` or `task`.
   * @param targetId - The space, the list or the task.
   * @returns The id, or `undefined` when no request is pending.
   */
  async function pendingRequestOf(
    requester: Person,
    target: 'space' | 'list' | 'task',
    targetId: string,
  ): Promise<string | undefined> {
    const rows = await asSystem<{ readonly id: string }>(
      `select id::text as id from access_requests
        where organization_id = $1 and requester_user_id = $2 and target = $3 and target_id = $4
          and state = 'pending'`,
      [atelierNordId, requester.userId, target, targetId],
    );
    return rows[0]?.id;
  }

  /**
   * The id of a stored request of the scenarios.
   *
   * @param name - Its name in the scenarios (`R1` to `R6`).
   * @returns The id.
   */
  function requestId(name: string): string {
    const id = requests.get(name);
    if (id === undefined) {
      throw new Error(`The request ${name} was not stored.`);
    }
    return id;
  }

  /**
   * Lists the pending access requests a member may answer.
   *
   * @param actor - Who reads.
   * @param query - The query string, without `?`.
   * @returns The page.
   */
  async function pendingSeenBy(
    actor: Person,
    query = '',
  ): Promise<z.output<typeof ListAccessRequestsInternalResponse>> {
    return read(
      ListAccessRequestsInternalResponse,
      `/internal/v1/access-requests${query === '' ? '' : `?${query}`}`,
      actor,
    );
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
    readonly traceparent: string | null;
  }

  /**
   * Reads the clean-up jobs of an account in Atelier Nord, oldest first, as the migrator role,
   * which owns the `pgboss` schema.
   *
   * @param person - The account.
   * @returns The jobs.
   */
  async function cleanUpJobsOf(person: Person): Promise<CleanUpJob[]> {
    const result = await migrator.query<CleanUpJob>(
      `select state, retry_count, data -> 'payload' ->> 'traceparent' as traceparent from pgboss.job
        where name = 'task.clean-up-removed-member'
          and data ->> 'organizationId' = $1 and data -> 'payload' ->> 'userId' = $2
        order by created_on, id`,
      [atelierNordId, person.userId],
    );
    return result.rows;
  }

  /**
   * Waits until the clean-up jobs of an account in Atelier Nord are all completed.
   *
   * @param person - The account.
   * @param count - How many jobs it must have.
   */
  async function cleanUpsCompleted(person: Person, count: number): Promise<void> {
    await vi.waitFor(
      async () => {
        const jobs = await cleanUpJobsOf(person);
        expect(jobs.map((job) => job.state)).toEqual(
          Array.from({ length: count }, () => 'completed'),
        );
      },
      { timeout: 120_000, interval: 250 },
    );
  }

  /**
   * Holds a row of `spaces` locked by a transaction of the migrator role, as a concurrent change
   * would hold it, while `work` runs; the lock is released after it, whatever happens.
   *
   * @param spaceId - The space of Atelier Nord.
   * @param work - What runs while the row is held.
   */
  async function whileSpaceHeld(spaceId: string, work: () => Promise<void>): Promise<void> {
    const blocker = await migrator.connect();
    try {
      await blocker.query('begin');
      await blocker.query(`select set_config('app.system_access', 'on', true)`);
      await blocker.query(
        `select 1 from spaces where organization_id = $1 and id = $2 for update`,
        [atelierNordId, spaceId],
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
      max: 3,
    });
    application = new pg.Pool({
      connectionString: `postgres://task_app:task_app@127.0.0.1:${postgresPort}/task`,
      max: 1,
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
    const joins: readonly PublishedEvent[] = [
      toPublishedEvent('joined', atelierNordId, camille, 'owner', 1),
      toPublishedEvent('joined', atelierNordId, ines, 'admin', 1),
      toPublishedEvent('joined', atelierNordId, hugo, 'member', 1),
      toPublishedEvent('joined', atelierNordId, lea, 'member', 1),
      toPublishedEvent('joined', atelierNordId, nadia, 'guest', 1),
      toPublishedEvent('joined', atelierNordId, mathis, 'member', 1),
      toPublishedEvent('joined', atelierNordId, chloe, 'member', 1),
      toPublishedEvent('joined', atelierNordId, noe, 'member', 1),
      toPublishedEvent('joined', atelierDeltaId, solene, 'owner', 1),
    ];
    for (const join of joins) {
      publish(join);
    }
    await vi.waitFor(
      async () => {
        expect(await activeMembers(atelierNordId)).toEqual(
          [camille, ines, hugo, lea, nadia, mathis, chloe, noe]
            .map((person) => person.userId)
            .sort(),
        );
        expect(await activeMembers(atelierDeltaId)).toEqual([solene.userId]);
      },
      { timeout: 60_000, interval: 500 },
    );
  }, 240_000);

  afterAll(async () => {
    try {
      await app?.close();
      await application.end();
      await telemetry?.shutdown();
      await migrator.end();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  });

  describe('the grants of a space are changed by the people who manage it', () => {
    it('lets Hugo, owner of his private space "Recherche", give Léa view and Inès comment: 200 with the grant, the ETag of the next version, and space.access-changed.v1 with every grant', async () => {
      const created = await createSpace(camille, {
        name: 'Produit',
        prefix: 'CAD',
        icon: 'rocket',
        color: 'violet',
      });
      produit = created.space;
      produitFirstList = created.firstList;
      const researched = await createSpace(hugo, {
        name: 'Recherche',
        prefix: 'RCH',
        visibility: 'private',
      });
      recherche = researched.space;
      rechercheFirstList = researched.firstList;
      const directed = await createSpace(camille, {
        name: 'Direction',
        prefix: 'DIR',
        visibility: 'private',
      });
      direction = directed.space;
      directionList = directed.firstList;
      const eventsBefore = (await outboxOf('spaceId', recherche.id)).length;

      const given = await putGrant(hugo, 'spaces', recherche.id, lea.userId, 'view');

      expect(given.status).toBe(200);
      expect(conforms(SetSpaceGrantInternalResponse, bodyOf(given))).toMatchObject({
        userId: lea.userId,
        role: 'view',
        grantedBy: { type: 'user', id: hugo.userId },
      });
      expect(given.headers.etag).toBe('"2"');
      expect((await readSpace(hugo, recherche.id)).version).toBe(2);
      const second = await grant(hugo, 'spaces', recherche.id, ines.userId, 'comment');
      expect(second.etag).toBe('"3"');

      const events = await outboxSince('spaceId', recherche.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual([
        'space.access-changed.v1',
        'space.access-changed.v1',
      ]);
      expect(
        conforms(taskEventSchemas['space.access-changed.v1'], events[0]?.payload),
      ).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: hugo.userId },
        version: 2,
        spaceId: recherche.id,
        grants: [{ userId: lea.userId, role: 'view' }],
        changedUserIds: [lea.userId],
      });
      expect(
        conforms(taskEventSchemas['space.access-changed.v1'], events[1]?.payload),
      ).toMatchObject({
        version: 3,
        grants: [
          { userId: lea.userId, role: 'view' },
          { userId: ines.userId, role: 'comment' },
        ],
        changedUserIds: [ines.userId],
      });
      recherche = await readSpace(hugo, recherche.id);
    });

    it('shows "Recherche" to its grantees with the role of their grant, and lets neither of them manage it', async () => {
      for (const [person, role] of [
        [lea, 'view'],
        [ines, 'comment'],
      ] as const) {
        expect(await readSpace(person, recherche.id)).toMatchObject({
          visibility: 'private',
          callerRole: role,
          callerCanManage: false,
        });
        expect(
          (await spacesSeenBy(person)).find((space) => space.id === recherche.id),
        ).toMatchObject({ callerRole: role, callerCanManage: false });
      }
      expect(await readSpace(hugo, recherche.id)).toMatchObject({
        callerRole: 'edit',
        callerCanManage: true,
      });
      expectProblem(
        await send('get', `/internal/v1/spaces/${recherche.id}`, camille),
        404,
        'space.not-found',
      );
    });

    it('refuses whoever sees a space without managing it with 403 space.manage-forbidden, and answers 404 to the owner of the organization for a private space of Hugo', async () => {
      const eventsBefore = (await outboxOf('spaceId', recherche.id)).length;

      for (const viewer of [lea, ines]) {
        expectProblem(
          await putGrant(viewer, 'spaces', recherche.id, mathis.userId, 'view'),
          403,
          'space.manage-forbidden',
        );
        expectProblem(
          await removeGrant(viewer, 'spaces', recherche.id, lea.userId),
          403,
          'space.manage-forbidden',
        );
      }
      expectProblem(
        await putGrant(camille, 'spaces', recherche.id, mathis.userId, 'view'),
        404,
        'space.not-found',
      );
      expectProblem(
        await removeGrant(camille, 'spaces', recherche.id, lea.userId),
        404,
        'space.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/spaces/${recherche.id}/grants`, camille),
        404,
        'space.not-found',
      );
      for (const member of [hugo, lea]) {
        expectProblem(
          await putGrant(member, 'spaces', produit.id, mathis.userId, 'view'),
          403,
          'space.manage-forbidden',
        );
      }

      expect((await readSpace(hugo, recherche.id)).version).toBe(recherche.version);
      expect((await readSpace(camille, produit.id)).version).toBe(produit.version);
      expect(await outboxOf('spaceId', recherche.id)).toHaveLength(eventsBefore);
    });

    it('lets the owner and the admin of the organization share a space of the whole organization, and keeps the order a person was first given access', async () => {
      const eventsBefore = (await outboxOf('spaceId', produit.id)).length;

      expect((await grant(ines, 'spaces', produit.id, hugo.userId, 'view')).etag).toBe('"2"');
      expect((await grant(camille, 'spaces', produit.id, lea.userId, 'comment')).etag).toBe('"3"');
      const raised = await grant(camille, 'spaces', produit.id, lea.userId, 'edit');
      expect(raised.etag).toBe('"4"');
      expect(raised.grant).toMatchObject({ role: 'edit', grantedBy: { id: camille.userId } });

      const page = await read(
        ListSpaceGrantsInternalResponse,
        `/internal/v1/spaces/${produit.id}/grants`,
        lea,
      );
      expect(page).toMatchObject({ nextCursor: null, total: 2 });
      expect(page.items.map((item) => [item.userId, item.role])).toEqual([
        [hugo.userId, 'view'],
        [lea.userId, 'edit'],
      ]);

      const removedByInes = await removeGrant(ines, 'spaces', produit.id, hugo.userId);
      expect(removedByInes.status).toBe(204);
      expect(removedByInes.headers.etag).toBe('"5"');
      const removedByCamille = await removeGrant(camille, 'spaces', produit.id, lea.userId);
      expect(removedByCamille.status).toBe(204);
      expect(removedByCamille.headers.etag).toBe('"6"');

      const events = await outboxSince('spaceId', produit.id, eventsBefore);
      expect(
        events.map((event) => conforms(taskEventSchemas['space.access-changed.v1'], event.payload)),
      ).toMatchObject([
        { version: 2, actor: { id: ines.userId }, grants: [{ userId: hugo.userId }] },
        { version: 3, grants: [{ userId: hugo.userId }, { userId: lea.userId, role: 'comment' }] },
        { version: 4, grants: [{ userId: hugo.userId }, { userId: lea.userId, role: 'edit' }] },
        {
          version: 5,
          actor: { id: ines.userId },
          grants: [{ userId: lea.userId, role: 'edit' }],
          changedUserIds: [hugo.userId],
        },
        { version: 6, actor: { id: camille.userId }, grants: [], changedUserIds: [lea.userId] },
      ]);
      produit = await readSpace(camille, produit.id);
      expect(produit.version).toBe(6);
    });

    it('refuses a stranger, a guest and the owner of the space with 422, and changes nothing', async () => {
      const stranger = randomUUID();
      const eventsBefore = (await outboxOf('spaceId', recherche.id)).length;

      expectProblem(
        await putGrant(hugo, 'spaces', recherche.id, stranger.toUpperCase(), 'view'),
        422,
        'access.grantee-invalid',
        { userId: stranger },
      );
      expectProblem(
        await putGrant(hugo, 'spaces', recherche.id, nadia.userId, 'view'),
        422,
        'access.guest-space-forbidden',
      );
      expectProblem(
        await putGrant(hugo, 'spaces', recherche.id, hugo.userId, 'view'),
        422,
        'access.owner-unchangeable',
      );
      expectProblem(
        await removeGrant(hugo, 'spaces', recherche.id, hugo.userId),
        422,
        'access.owner-unchangeable',
      );
      expectProblem(
        await putGrant(camille, 'spaces', produit.id, camille.userId, 'view'),
        422,
        'access.owner-unchangeable',
      );

      expect((await readSpace(hugo, recherche.id)).version).toBe(recherche.version);
      expect(await outboxOf('spaceId', recherche.id)).toHaveLength(eventsBefore);
      expect(await countRows('space_grants', 'user_id = $2', stranger)).toBe(0);
    });

    it('answers the same role again with 200 and the same version, and a removal without grant with 204 and the same version, and appends nothing', async () => {
      const eventsBefore = (await outboxOf('spaceId', recherche.id)).length;
      const listed = await read(
        ListSpaceGrantsInternalResponse,
        `/internal/v1/spaces/${recherche.id}/grants`,
        hugo,
      );

      const again = await putGrant(hugo, 'spaces', recherche.id, lea.userId, 'view');
      const without = await removeGrant(hugo, 'spaces', recherche.id, camille.userId);

      expect(again.status).toBe(200);
      expect(again.headers.etag).toBe(etagOf(recherche.version));
      expect(conforms(SetSpaceGrantInternalResponse, bodyOf(again))).toEqual(listed.items[0]);
      expect(without.status).toBe(204);
      expect(without.headers.etag).toBe(etagOf(recherche.version));
      expect(await outboxOf('spaceId', recherche.id)).toHaveLength(eventsBefore);
      expect((await readSpace(hugo, recherche.id)).version).toBe(recherche.version);
    });

    it('guards a change with If-Match: 412 request.version-mismatch with the version of the space, and the change with the right one', async () => {
      const version = recherche.version;

      expectProblem(
        await putGrant(hugo, 'spaces', recherche.id, mathis.userId, 'view', {
          'If-Match': etagOf(version - 1),
        }),
        412,
        'request.version-mismatch',
        { version },
      );
      const given = await putGrant(hugo, 'spaces', recherche.id, mathis.userId, 'view', {
        'If-Match': etagOf(version),
      });
      expect(given.status).toBe(200);
      expect(given.headers.etag).toBe(etagOf(version + 1));
      expectProblem(
        await removeGrant(hugo, 'spaces', recherche.id, mathis.userId, {
          'If-Match': etagOf(version),
        }),
        412,
        'request.version-mismatch',
        { version: version + 1 },
      );
      const removed = await removeGrant(hugo, 'spaces', recherche.id, mathis.userId, {
        'If-Match': etagOf(version + 1),
      });
      expect(removed.status).toBe(204);
      expect(removed.headers.etag).toBe(etagOf(version + 2));

      const last = (await outboxOf('spaceId', recherche.id)).at(-1);
      expect(conforms(taskEventSchemas['space.access-changed.v1'], last?.payload)).toMatchObject({
        version: version + 2,
        grants: [
          { userId: lea.userId, role: 'view' },
          { userId: ines.userId, role: 'comment' },
        ],
        changedUserIds: [mathis.userId],
      });
      recherche = await readSpace(hugo, recherche.id);
      expect(recherche.version).toBe(version + 2);
    });

    it('lists the grants in the order they were first given, page by page, with the total on every page, to whoever sees the space', async () => {
      for (const reader of [hugo, lea]) {
        const full = await read(
          ListSpaceGrantsInternalResponse,
          `/internal/v1/spaces/${recherche.id}/grants`,
          reader,
        );
        expect(full).toMatchObject({ nextCursor: null, total: 2 });
        expect(full.items.map((item) => [item.userId, item.role])).toEqual([
          [lea.userId, 'view'],
          [ines.userId, 'comment'],
        ]);
      }

      const first = await read(
        ListSpaceGrantsInternalResponse,
        `/internal/v1/spaces/${recherche.id}/grants?limit=1`,
        hugo,
      );
      expect(first.items.map((item) => item.userId)).toEqual([lea.userId]);
      expect(first.total).toBe(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await read(
        ListSpaceGrantsInternalResponse,
        `/internal/v1/spaces/${recherche.id}/grants?limit=1&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
        hugo,
      );
      expect(second.items.map((item) => item.userId)).toEqual([ines.userId]);
      expect(second).toMatchObject({ nextCursor: null, total: 2 });
    });

    it('refuses the 201st grant of a space with 422 access.grant-limit-reached, but lets a held grant change role', async () => {
      const created = await createSpace(camille, { name: 'Communauté', prefix: 'COM' });
      communaute = created.space;
      communauteFirstList = created.firstList;
      // 199 people given access by an import, then Léa, the 200th, through the route.
      await asSystem(
        `insert into space_grants
           (organization_id, space_id, user_id, role, granted_by_type, granted_by_id, created_at, granted_at)
         select $1, $2, gen_random_uuid(), 'view', 'user', $3,
                now() - make_interval(secs => 1000 - n), now() - make_interval(secs => 1000 - n)
           from generate_series(1, 199) as n`,
        [atelierNordId, communaute.id, camille.userId],
      );

      expect((await grant(camille, 'spaces', communaute.id, lea.userId, 'view')).etag).toBe('"2"');
      expectProblem(
        await putGrant(camille, 'spaces', communaute.id, hugo.userId, 'view'),
        422,
        'access.grant-limit-reached',
      );
      expect((await readSpace(camille, communaute.id)).version).toBe(2);
      expect((await grant(camille, 'spaces', communaute.id, lea.userId, 'edit')).etag).toBe('"3"');
      expect(await countRows('space_grants', 'space_id = $2', communaute.id)).toBe(200);

      const walked: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string =
          cursor === null ? 'limit=100' : `limit=100&cursor=${encodeURIComponent(cursor)}`;
        const page = await read(
          ListSpaceGrantsInternalResponse,
          `/internal/v1/spaces/${communaute.id}/grants?${query}`,
          lea,
        );
        expect(page.items).toHaveLength(100);
        expect(page.total).toBe(200);
        walked.push(...page.items.map((item) => item.userId));
        cursor = page.nextCursor;
      } while (cursor !== null);
      expect(new Set(walked).size).toBe(200);
      expect(walked.at(-1)).toBe(lea.userId);
    });
  });

  describe('the grants of a list are changed by whoever has edit on it', () => {
    it('lets the owner of the space give the guest Nadia edit on Sprint 14, and announces list.access-changed.v1', async () => {
      sprint14 = await createList(camille, produit.id, {
        name: 'Sprint 14',
        sprint: {
          startDate: '2026-11-03',
          endDate: '2026-11-17',
          goal: 'Stabiliser la vue calendrier',
        },
      });
      backlog = await createList(camille, produit.id, { name: 'Backlog produit' });
      entretiens = await createList(hugo, recherche.id, { name: 'Entretiens' });

      const given = await grant(camille, 'lists', sprint14.id, nadia.userId, 'edit');

      expect(given.etag).toBe('"2"');
      expect(given.grant).toMatchObject({
        userId: nadia.userId,
        role: 'edit',
        grantedBy: { type: 'user', id: camille.userId },
      });
      const last = (await outboxOf('listId', sprint14.id)).at(-1);
      expect(last?.event_name).toBe('list.access-changed.v1');
      expect(conforms(taskEventSchemas['list.access-changed.v1'], last?.payload)).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: camille.userId },
        version: 2,
        listId: sprint14.id,
        spaceId: produit.id,
        organizationAccess: true,
        grants: [{ userId: nadia.userId, role: 'edit' }],
        changed: ['grants'],
        changedUserIds: [nadia.userId],
      });
      sprint14 = await readList(camille, sprint14.id);
    });

    it('lets a plain member with edit on a list share it, and refuses the grantees who see a list with view or comment with 403 access.role-insufficient', async () => {
      const given = await grant(lea, 'lists', backlog.id, mathis.userId, 'comment');
      expect(given.etag).toBe('"2"');

      for (const [viewer, role] of [
        [lea, 'view'],
        [ines, 'comment'],
      ] as const) {
        expectProblem(
          await putGrant(viewer, 'lists', entretiens.id, mathis.userId, 'view'),
          403,
          'access.role-insufficient',
          { role, requiredRole: 'edit' },
        );
        expectProblem(
          await removeGrant(viewer, 'lists', entretiens.id, lea.userId),
          403,
          'access.role-insufficient',
          { role, requiredRole: 'edit' },
        );
      }
      expectProblem(
        await putGrant(camille, 'lists', entretiens.id, mathis.userId, 'view'),
        404,
        'list.not-found',
      );
      expect((await readList(hugo, entretiens.id)).version).toBe(1);

      const removed = await removeGrant(lea, 'lists', backlog.id, mathis.userId);
      expect(removed.status).toBe(204);
      expect(removed.headers.etag).toBe('"3"');
      const last = (await outboxOf('listId', backlog.id)).at(-1);
      expect(conforms(taskEventSchemas['list.access-changed.v1'], last?.payload)).toMatchObject({
        actor: { type: 'user', id: lea.userId },
        version: 3,
        grants: [],
        changed: ['grants'],
        changedUserIds: [mathis.userId],
      });
      backlog = await readList(camille, backlog.id);
    });

    it('refuses the owner of the space and a stranger with 422, and guards a change with If-Match', async () => {
      const stranger = randomUUID();

      expectProblem(
        await putGrant(camille, 'lists', sprint14.id, camille.userId, 'view'),
        422,
        'access.owner-unchangeable',
      );
      expectProblem(
        await removeGrant(camille, 'lists', sprint14.id, camille.userId),
        422,
        'access.owner-unchangeable',
      );
      expectProblem(
        await putGrant(hugo, 'lists', entretiens.id, hugo.userId, 'edit'),
        422,
        'access.owner-unchangeable',
      );
      expectProblem(
        await putGrant(hugo, 'lists', entretiens.id, stranger, 'view'),
        422,
        'access.grantee-invalid',
        { userId: stranger },
      );
      expectProblem(
        await putGrant(camille, 'lists', sprint14.id, lea.userId, 'view', { 'If-Match': '"1"' }),
        412,
        'request.version-mismatch',
        { version: sprint14.version },
      );
      expect((await readList(camille, sprint14.id)).version).toBe(sprint14.version);
    });

    it('lets any role read the grants of a list, answers the same role again with the same version and a removal without grant with 204', async () => {
      const eventsBefore = (await outboxOf('listId', sprint14.id)).length;

      const shared = await read(
        ListListGrantsInternalResponse,
        `/internal/v1/lists/${sprint14.id}/grants`,
        nadia,
      );
      const again = await putGrant(camille, 'lists', sprint14.id, nadia.userId, 'edit');
      const without = await removeGrant(camille, 'lists', sprint14.id, lea.userId);
      const unshared = await read(
        ListListGrantsInternalResponse,
        `/internal/v1/lists/${entretiens.id}/grants`,
        lea,
      );

      expect(shared).toMatchObject({ nextCursor: null, total: 1 });
      expect(shared.items.map((item) => [item.userId, item.role])).toEqual([
        [nadia.userId, 'edit'],
      ]);
      expect(again.status).toBe(200);
      expect(again.headers.etag).toBe(etagOf(sprint14.version));
      expect(conforms(SetListGrantInternalResponse, bodyOf(again))).toEqual(shared.items[0]);
      expect(without.status).toBe(204);
      expect(without.headers.etag).toBe(etagOf(sprint14.version));
      expect(await outboxOf('listId', sprint14.id)).toHaveLength(eventsBefore);
      expect(unshared).toEqual({ items: [], nextCursor: null, total: 0 });
    });
  });

  describe('the switch "Accès de l’organisation" of a list', () => {
    it('announces a new list with the switch on, and turning it off emits list.access-changed.v1 and no list.updated.v1', async () => {
      budget = await createList(camille, produit.id, { name: 'Budget' });
      expect(budget).toMatchObject({ organizationAccess: true, callerRole: 'edit' });
      const [created] = await outboxOf('listId', budget.id);
      expect(conforms(taskEventSchemas['list.created.v1'], created?.payload)).toMatchObject({
        listId: budget.id,
        organizationAccess: true,
      });
      budgetTask = await createTask(camille, budget.id, {
        name: 'Chiffrer l’outillage',
        assigneeIds: [lea.userId],
      });
      const eventsBefore = (await outboxOf('listId', budget.id)).length;

      const response = await send('patch', `/internal/v1/lists/${budget.id}`, camille, {
        body: { organizationAccess: false },
      });

      expect(response.status).toBe(200);
      expect(conforms(UpdateListInternalResponse, bodyOf(response))).toMatchObject({
        organizationAccess: false,
        callerRole: 'edit',
        version: 2,
      });
      expect(response.headers.etag).toBe('"2"');
      const events = await outboxSince('listId', budget.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual(['list.access-changed.v1']);
      expect(
        conforms(taskEventSchemas['list.access-changed.v1'], events[0]?.payload),
      ).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        version: 2,
        listId: budget.id,
        spaceId: produit.id,
        organizationAccess: false,
        grants: [],
        changed: ['organizationAccess'],
        changedUserIds: [],
      });
    });

    it('takes one version for a patch that renames the list and turns the switch on, and emits list.updated.v1 then list.access-changed.v1 with it', async () => {
      const eventsBefore = (await outboxOf('listId', budget.id)).length;

      const response = await send('patch', `/internal/v1/lists/${budget.id}`, camille, {
        body: { name: 'Budget 2027', organizationAccess: true },
      });

      expect(response.status).toBe(200);
      expect(conforms(UpdateListInternalResponse, bodyOf(response))).toMatchObject({
        name: 'Budget 2027',
        organizationAccess: true,
        version: 3,
      });
      const events = await outboxSince('listId', budget.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual([
        'list.updated.v1',
        'list.access-changed.v1',
      ]);
      expect(conforms(taskEventSchemas['list.updated.v1'], events[0]?.payload)).toMatchObject({
        version: 3,
        name: 'Budget 2027',
        changed: ['name'],
      });
      expect(
        conforms(taskEventSchemas['list.access-changed.v1'], events[1]?.payload),
      ).toMatchObject({
        version: 3,
        organizationAccess: true,
        changed: ['organizationAccess'],
        changedUserIds: [],
      });
    });

    it('answers a plain member who turns the switch off with the role the change was made with, then hides the list from her', async () => {
      const response = await send('patch', `/internal/v1/lists/${budget.id}`, lea, {
        body: { organizationAccess: false },
      });

      expect(response.status).toBe(200);
      expect(conforms(UpdateListInternalResponse, bodyOf(response))).toMatchObject({
        organizationAccess: false,
        callerRole: 'edit',
        version: 4,
      });
      const last = (await outboxOf('listId', budget.id)).at(-1);
      expect(conforms(taskEventSchemas['list.access-changed.v1'], last?.payload)).toMatchObject({
        actor: { type: 'user', id: lea.userId },
        version: 4,
        organizationAccess: false,
      });
      expectProblem(
        await send('get', `/internal/v1/lists/${budget.id}`, lea),
        404,
        'list.not-found',
      );
      budget = await readList(camille, budget.id);
    });

    it('hides a list closed to the organization from a member and the admin in every read, and shows it to the owner of the space and to its grantees', async () => {
      await grant(camille, 'lists', budget.id, hugo.userId, 'comment');
      budget = await readList(camille, budget.id);
      const overviewOf = async (
        viewer: Person,
      ): Promise<z.output<typeof GetSpaceOverviewInternalResponse>> =>
        read(
          GetSpaceOverviewInternalResponse,
          `/internal/v1/spaces/${produit.id}/overview?today=${today}`,
          viewer,
        );
      const full = await overviewOf(camille);
      expect(full.items.map((item) => item.list.id)).toContain(budget.id);

      for (const viewer of [lea, ines]) {
        expectProblem(
          await send('get', `/internal/v1/lists/${budget.id}`, viewer),
          404,
          'list.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/lists/${budget.id}/tasks`, viewer),
          404,
          'list.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/lists/${budget.id}/counts?today=${today}`, viewer),
          404,
          'list.not-found',
        );
        expectProblem(
          await send('get', `/internal/v1/tasks/${budgetTask.key}`, viewer),
          404,
          'task.not-found',
        );
        expect((await listsSeenBy(viewer, produit.id)).map((list) => list.id)).not.toContain(
          budget.id,
        );
        const overview = await overviewOf(viewer);
        expect(overview.items.map((item) => item.list.id)).not.toContain(budget.id);
        expect(overview.listCount).toBe(full.listCount - 1);
        expect(overview.taskCount).toBe(full.taskCount - 1);
        const home = await read(
          GetHomeInternalResponse,
          `/internal/v1/users/${viewer.userId}/home?today=${today}`,
          viewer,
        );
        expect(home.lists.map((item) => item.list.id)).not.toContain(budget.id);
      }
      const mine = await read(
        ListMyTasksInternalResponse,
        `/internal/v1/users/${lea.userId}/tasks`,
        lea,
      );
      expect(mine.items.map((task) => task.key)).not.toContain(budgetTask.key);

      expect(await readList(camille, budget.id)).toMatchObject({
        organizationAccess: false,
        callerRole: 'edit',
      });
      expect(await readList(hugo, budget.id)).toMatchObject({
        organizationAccess: false,
        callerRole: 'comment',
      });
      expect(
        await read(GetTaskInternalResponse, `/internal/v1/tasks/${budgetTask.key}`, hugo),
      ).toMatchObject({ key: budgetTask.key, listId: budget.id });
      expect(
        (await listsSeenBy(hugo, produit.id)).find((list) => list.id === budget.id),
      ).toMatchObject({ callerRole: 'comment', organizationAccess: false });
    });

    it('creates a list closed to the organization from the start, and says so in list.created.v1', async () => {
      recrutement = await createList(camille, produit.id, {
        name: 'Recrutement',
        organizationAccess: false,
      });

      expect(recrutement).toMatchObject({
        name: 'Recrutement',
        organizationAccess: false,
        callerRole: 'edit',
        version: 1,
      });
      const [created] = await outboxOf('listId', recrutement.id);
      expect(conforms(taskEventSchemas['list.created.v1'], created?.payload)).toMatchObject({
        listId: recrutement.id,
        organizationAccess: false,
      });
      for (const viewer of [lea, ines, hugo]) {
        expectProblem(
          await send('get', `/internal/v1/lists/${recrutement.id}`, viewer),
          404,
          'list.not-found',
        );
      }
    });
  });

  describe('the role of the caller on a list decides what every route lets them read and change', () => {
    it('lets a grantee with view or comment read "Recherche", its lists and a task, each with the role of the grant', async () => {
      entretiensTask = await createTask(hugo, entretiens.id, {
        name: 'Entretiens utilisateurs',
        assigneeIds: [lea.userId],
        labels: ['Entretien'],
        subtasks: [{ name: 'Guide d’entretien' }],
      });
      const item = await send(
        'post',
        `/internal/v1/tasks/${entretiensTask.key}/checklist-items`,
        hugo,
        { body: { text: 'Recruter cinq personnes' } },
      );
      expect(item.status).toBe(201);
      checklistItemId =
        conforms(AddChecklistItemInternalResponse, bodyOf(item)).checklist[0]?.id ?? '';
      entretiensTask = await read(
        GetTaskInternalResponse,
        `/internal/v1/tasks/${entretiensTask.key}`,
        hugo,
      );
      directionTask = await createTask(camille, directionList.id, {
        name: 'Budget de la direction',
        assigneeIds: [lea.userId],
        labels: ['Confidentiel'],
      });
      demoTask = await createTask(camille, backlog.id, {
        name: 'Préparer la démo',
        labels: ['Démo'],
      });
      calendarTask = await createTask(camille, sprint14.id, {
        name: 'Corriger le calendrier',
        labels: ['Calendrier'],
      });

      for (const [viewer, role] of [
        [lea, 'view'],
        [ines, 'comment'],
      ] as const) {
        expect(await readSpace(viewer, recherche.id)).toMatchObject({
          callerRole: role,
          callerCanManage: false,
        });
        const lists = await listsSeenBy(viewer, recherche.id);
        expect(lists.map((list) => [list.id, list.callerRole, list.organizationAccess])).toEqual([
          [rechercheFirstList.id, role, true],
          [entretiens.id, role, true],
        ]);
        expect(await readList(viewer, entretiens.id)).toMatchObject({
          callerRole: role,
          organizationAccess: true,
        });
        expect(
          await read(GetTaskInternalResponse, `/internal/v1/tasks/${entretiensTask.key}`, viewer),
        ).toEqual(entretiensTask);
        const detail = await read(
          GetTaskDetailInternalResponse,
          `/internal/v1/tasks/${entretiensTask.key}/detail`,
          viewer,
        );
        expect(detail.task.key).toBe(entretiensTask.key);
        expect(detail.space).toMatchObject({ callerRole: role, callerCanManage: false });
        expect(detail.list).toMatchObject({ callerRole: role, organizationAccess: true });
        const subtasks = await read(
          ListSubtasksInternalResponse,
          `/internal/v1/tasks/${entretiensTask.key}/subtasks`,
          viewer,
        );
        expect(subtasks.items.map((task) => task.name)).toEqual(['Guide d’entretien']);
        await read(
          ListTaskActivityInternalResponse,
          `/internal/v1/tasks/${entretiensTask.key}/activity`,
          viewer,
        );
        await read(
          ListListActivityInternalResponse,
          `/internal/v1/lists/${entretiens.id}/activity`,
          viewer,
        );
        const counts = await read(
          GetListCountsInternalResponse,
          `/internal/v1/lists/${entretiens.id}/counts?today=${today}`,
          viewer,
        );
        expect(counts.list).toMatchObject({ callerRole: role, organizationAccess: true });
        expect(counts.counts.total).toBe(1);
        const overview = await read(
          GetSpaceOverviewInternalResponse,
          `/internal/v1/spaces/${recherche.id}/overview?today=${today}`,
          viewer,
        );
        expect(overview.listCount).toBe(2);
        expect(overview.items.map((summary) => summary.list.callerRole)).toEqual([role, role]);
        const tasks = await read(
          ListTasksInternalResponse,
          `/internal/v1/lists/${entretiens.id}/tasks`,
          viewer,
        );
        expect(tasks.items.map((task) => task.key)).toEqual([entretiensTask.key]);
      }
    });

    it('refuses them every change with 403 access.role-insufficient and their role, and changes nothing', async () => {
      const key = entretiensTask.key;
      for (const [viewer, role] of [
        [lea, 'view'],
        [ines, 'comment'],
      ] as const) {
        const calls: readonly (readonly [HttpMethod, string, object | undefined])[] = [
          ['patch', `/internal/v1/spaces/${recherche.id}`, { description: 'Fuite' }],
          ['post', `/internal/v1/spaces/${recherche.id}/lists`, { name: 'Fuite' }],
          ['patch', `/internal/v1/lists/${entretiens.id}`, { name: 'Fuite' }],
          ['post', `/internal/v1/lists/${entretiens.id}/tasks`, { name: 'Fuite' }],
          ['patch', `/internal/v1/tasks/${key}`, { name: 'Fuite' }],
          ['put', `/internal/v1/tasks/${key}/assignees/${hugo.userId}`, {}],
          ['delete', `/internal/v1/tasks/${key}/assignees/${lea.userId}`, undefined],
          ['post', `/internal/v1/tasks/${key}/labels/add`, { name: 'Fuite' }],
          ['post', `/internal/v1/tasks/${key}/labels/remove`, { name: 'Entretien' }],
          ['post', `/internal/v1/tasks/${key}/checklist-items`, { text: 'Fuite' }],
          ['patch', `/internal/v1/tasks/${key}/checklist-items/${checklistItemId}`, { done: true }],
          ['post', `/internal/v1/tasks/${key}/subtasks`, { name: 'Fuite' }],
        ];
        for (const [method, path, body] of calls) {
          const response = await send(method, path, viewer, body === undefined ? {} : { body });
          expect(response.status, `${method} ${path}`).toBe(403);
          expectProblem(response, 403, 'access.role-insufficient', {
            role,
            requiredRole: 'edit',
          });
        }
      }

      expect(await read(GetTaskInternalResponse, `/internal/v1/tasks/${key}`, hugo)).toEqual(
        entretiensTask,
      );
      expect(await readSpace(hugo, recherche.id)).toMatchObject({
        version: recherche.version,
        description: null,
      });
      expect(await readList(hugo, entretiens.id)).toMatchObject({ version: 1 });
      expect((await listsSeenBy(hugo, recherche.id)).map((list) => list.name)).toEqual([
        'Première liste',
        'Entretiens',
      ]);
    });

    it('answers 404 for a task the caller does not see before any role, and 403 before a stale If-Match', async () => {
      expectProblem(
        await send('patch', `/internal/v1/tasks/${directionTask.key}`, lea, {
          body: { name: 'Fuite' },
        }),
        404,
        'task.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${directionTask.key}`, lea),
        404,
        'task.not-found',
      );
      const stale = { 'If-Match': '"99"' };
      for (const [path, body] of [
        [`/internal/v1/tasks/${entretiensTask.key}`, { name: 'Fuite' }],
        [`/internal/v1/spaces/${recherche.id}`, { description: 'Fuite' }],
        [`/internal/v1/lists/${entretiens.id}`, { name: 'Fuite' }],
      ] as const) {
        expectProblem(
          await send('patch', path, lea, { body, headers: stale }),
          403,
          'access.role-insufficient',
          { role: 'view', requiredRole: 'edit' },
        );
      }
      expectProblem(
        await putGrant(lea, 'lists', entretiens.id, mathis.userId, 'view', stale),
        403,
        'access.role-insufficient',
        { role: 'view', requiredRole: 'edit' },
      );
      expectProblem(
        await putGrant(lea, 'spaces', recherche.id, mathis.userId, 'view', stale),
        403,
        'space.manage-forbidden',
      );
    });

    it('refuses with 403 a move into a list the caller sees without edit, and with 422 task.list-invalid a move into a list they do not see', async () => {
      expectProblem(
        await send('patch', `/internal/v1/tasks/${demoTask.key}`, lea, {
          body: { listId: entretiens.id },
        }),
        403,
        'access.role-insufficient',
        { role: 'view', requiredRole: 'edit' },
      );
      expectProblem(
        await send('patch', `/internal/v1/tasks/${demoTask.key}`, lea, {
          body: { listId: directionList.id },
        }),
        422,
        'task.list-invalid',
      );
      expect(
        await read(GetTaskInternalResponse, `/internal/v1/tasks/${demoTask.key}`, camille),
      ).toMatchObject({ listId: backlog.id, version: demoTask.version });
    });

    it('lets the guest Nadia see and change the tasks of Sprint 14, shared with her, and nothing else of "Produit"', async () => {
      expect(await readList(nadia, sprint14.id)).toMatchObject({
        callerRole: 'edit',
        organizationAccess: true,
      });
      expect(
        await read(GetTaskInternalResponse, `/internal/v1/tasks/${calendarTask.key}`, nadia),
      ).toMatchObject({ key: calendarTask.key });
      const changed = await send('patch', `/internal/v1/tasks/${calendarTask.key}`, nadia, {
        body: { name: 'Corriger la vue calendrier' },
      });
      expect(changed.status).toBe(200);
      calendarTask = conforms(UpdateTaskInternalResponse, bodyOf(changed));
      expect(calendarTask).toMatchObject({ name: 'Corriger la vue calendrier', version: 2 });

      const spaces = await spacesSeenBy(nadia);
      expect(spaces.map((space) => [space.id, space.callerRole, space.callerCanManage])).toEqual([
        [produit.id, null, false],
      ]);
      expect(await readSpace(nadia, produit.id)).toMatchObject({
        callerRole: null,
        callerCanManage: false,
      });
      expect(
        (await listsSeenBy(nadia, produit.id)).map((list) => [list.id, list.callerRole]),
      ).toEqual([[sprint14.id, 'edit']]);
      const overview = await read(
        GetSpaceOverviewInternalResponse,
        `/internal/v1/spaces/${produit.id}/overview?today=${today}`,
        nadia,
      );
      expect(overview.listCount).toBe(1);
      expect(overview.items.map((summary) => summary.list.id)).toEqual([sprint14.id]);
      expectProblem(
        await send('get', `/internal/v1/lists/${backlog.id}`, nadia),
        404,
        'list.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${demoTask.key}`, nadia),
        404,
        'task.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/spaces/${recherche.id}`, nadia),
        404,
        'space.not-found',
      );
      expectProblem(
        await send('patch', `/internal/v1/spaces/${produit.id}`, nadia, {
          body: { description: 'Fuite' },
        }),
        403,
        'access.role-insufficient',
        { role: null, requiredRole: 'edit' },
      );
      expectProblem(
        await send('post', `/internal/v1/spaces/${produit.id}/lists`, nadia, {
          body: { name: 'Fuite' },
        }),
        403,
        'access.role-insufficient',
        { role: null, requiredRole: 'edit' },
      );
    });

    it('keeps the labels, "Mes tâches" and "Accueil" to the lists the caller has a role on', async () => {
      const labelsOf = async (viewer: Person): Promise<string[]> =>
        (await read(ListLabelsInternalResponse, '/internal/v1/labels?limit=100', viewer)).items.map(
          (label) => label.name,
        );
      const homeOf = async (viewer: Person): Promise<z.output<typeof GetHomeInternalResponse>> =>
        read(
          GetHomeInternalResponse,
          `/internal/v1/users/${viewer.userId}/home?today=${today}`,
          viewer,
        );

      expect(await labelsOf(nadia)).toEqual(['Calendrier']);
      const nadiaHome = await homeOf(nadia);
      expect(nadiaHome.lists.map((item) => [item.list.id, item.list.callerRole])).toEqual([
        [sprint14.id, 'edit'],
      ]);
      expect(nadiaHome.sprints.map((item) => item.list.id)).toEqual([sprint14.id]);
      expect(
        (await read(ListMyTasksInternalResponse, `/internal/v1/users/${nadia.userId}/tasks`, nadia))
          .items,
      ).toEqual([]);

      const leaLabels = await labelsOf(lea);
      expect(leaLabels).toEqual(expect.arrayContaining(['Calendrier', 'Démo', 'Entretien']));
      expect(leaLabels).not.toContain('Confidentiel');
      const leaTasks = (
        await read(ListMyTasksInternalResponse, `/internal/v1/users/${lea.userId}/tasks`, lea)
      ).items.map((task) => task.key);
      expect(leaTasks).toContain(entretiensTask.key);
      expect(leaTasks).not.toContain(directionTask.key);
      expect(leaTasks).not.toContain(budgetTask.key);
      // The first six lists of the sidebar, spaces then lists by creation, among those she has a
      // role on: "Recherche" through her grant, neither "Direction" nor the closed lists.
      const leaHome = await homeOf(lea);
      expect(leaHome.lists.map((item) => [item.list.id, item.list.callerRole])).toEqual([
        [produitFirstList.id, 'edit'],
        [sprint14.id, 'edit'],
        [backlog.id, 'edit'],
        [rechercheFirstList.id, 'view'],
        [entretiens.id, 'view'],
        [communauteFirstList.id, 'edit'],
      ]);
      const camilleHome = await homeOf(camille);
      expect(camilleHome.lists.map((item) => item.list.id)).toEqual([
        produitFirstList.id,
        sprint14.id,
        backlog.id,
        budget.id,
        recrutement.id,
        directionList.id,
      ]);
    });

    it('takes from a member made a guest what a grant of a space gave, and leaves a grant of a list', async () => {
      await grant(hugo, 'spaces', recherche.id, mathis.userId, 'edit');
      await grant(camille, 'lists', directionList.id, mathis.userId, 'view');
      expect(await readSpace(mathis, recherche.id)).toMatchObject({ callerRole: 'edit' });
      expect(await readSpace(mathis, direction.id)).toMatchObject({ callerRole: null });
      expect(await readSpace(mathis, produit.id)).toMatchObject({ callerRole: 'edit' });

      await deliver(toPublishedEvent('role-changed', atelierNordId, mathis, 'guest', 2, 'member'));

      expectProblem(
        await send('get', `/internal/v1/spaces/${recherche.id}`, mathis),
        404,
        'space.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/lists/${entretiens.id}`, mathis),
        404,
        'list.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/spaces/${produit.id}`, mathis),
        404,
        'space.not-found',
      );
      expect(
        (await spacesSeenBy(mathis)).map((space) => [
          space.id,
          space.callerRole,
          space.callerCanManage,
        ]),
      ).toEqual([[direction.id, null, false]]);
      expect(await readList(mathis, directionList.id)).toMatchObject({ callerRole: 'view' });
      const held = await read(
        ListSpaceGrantsInternalResponse,
        `/internal/v1/spaces/${recherche.id}/grants`,
        hugo,
      );
      expect(held.items.find((item) => item.userId === mathis.userId)).toMatchObject({
        role: 'edit',
      });
      recherche = await readSpace(hugo, recherche.id);
    });
  });

  describe('without grants, every route answers as in P3a, with the access of the caller added', () => {
    it('answers a space and its lists with the members of P3a plus callerRole, callerCanManage, organizationAccess and the archive members of PR 2', async () => {
      for (const [viewer, manages] of [
        [camille, true],
        [ines, true],
        [hugo, false],
        [lea, false],
      ] as const) {
        const space = await readSpace(viewer, produit.id);
        expect(Object.keys(space).sort()).toEqual(
          [...p3aSpaceMembers, 'callerRole', 'callerCanManage'].sort(),
        );
        expect(space).toMatchObject({ callerRole: 'edit', callerCanManage: manages });
        const list = await readList(viewer, backlog.id);
        expect(Object.keys(list).sort()).toEqual(
          [
            ...p3aListMembers,
            'organizationAccess',
            'callerRole',
            'archivedAt',
            'archivedBy',
          ].sort(),
        );
        expect(list).toMatchObject({
          organizationAccess: true,
          callerRole: 'edit',
          archivedAt: null,
          archivedBy: null,
        });
        const lists = await listsSeenBy(viewer, produit.id);
        expect(
          lists
            .filter((item) => item.id === produitFirstList.id || item.id === backlog.id)
            .map((item) => [item.id, item.callerRole, item.organizationAccess]),
        ).toEqual([
          [produitFirstList.id, 'edit', true],
          [backlog.id, 'edit', true],
        ]);
      }

      const veille = await createSpace(lea, { name: 'Veille', prefix: 'VEI' });
      expect(veille.space).toMatchObject({ callerRole: 'edit', callerCanManage: true });
      expect(veille.firstList).toMatchObject({ organizationAccess: true, callerRole: 'edit' });
      expect(await readSpace(camille, veille.space.id)).toMatchObject({
        callerRole: 'edit',
        callerCanManage: true,
      });
      expect(await readSpace(hugo, veille.space.id)).toMatchObject({
        callerRole: 'edit',
        callerCanManage: false,
      });
      const edited = await send('patch', `/internal/v1/spaces/${produit.id}`, lea, {
        body: { description: 'Feuille de route et livraisons' },
      });
      expect(edited.status).toBe(200);
      expect(conforms(UpdateSpaceInternalResponse, bodyOf(edited))).toMatchObject({
        description: 'Feuille de route et livraisons',
        callerRole: 'edit',
        callerCanManage: false,
      });
      produit = await readSpace(camille, produit.id);
    });

    it('still hides a private space of Hugo from the owner and the admin of the organization', async () => {
      carnet = (await createSpace(hugo, { name: 'Carnet', prefix: 'CRN', visibility: 'private' }))
        .space;

      expect(carnet).toMatchObject({ callerRole: 'edit', callerCanManage: true });
      for (const viewer of [camille, ines]) {
        expectProblem(
          await send('get', `/internal/v1/spaces/${carnet.id}`, viewer),
          404,
          'space.not-found',
        );
        expect((await spacesSeenBy(viewer)).map((space) => space.id)).not.toContain(carnet.id);
      }
    });
  });

  describe('access requests', () => {
    it('answers 202 with an empty body whatever the target, and stores a request only for an existing target the caller has no role on', async () => {
      await forgetAttempts(lea, nadia, hugo, chloe);
      const before = await countRows('access_requests', 'true');

      await ask(lea, { spaceId: randomUUID() });
      await ask(lea, {
        spaceId: direction.id,
        message: '  Je dois chiffrer la part outillage du budget 2027.  ',
      });
      await ask(lea, { listId: backlog.id });
      await ask(lea, { taskKey: 'ZZZ-999' });
      await ask(lea, { taskKey: budgetTask.key, message: '' });
      await ask(lea, { spaceId: recherche.id });
      await ask(nadia, { spaceId: direction.id });
      await ask(nadia, { listId: budget.id, message: 'Pour suivre le budget' });
      await ask(hugo, { listId: directionList.id });
      await ask(chloe, { spaceId: direction.id });

      const stored = await asSystem<{
        readonly id: string;
        readonly target: string;
        readonly target_id: string;
        readonly space_id: string;
        readonly list_id: string | null;
        readonly task_id: string | null;
        readonly task_key: string | null;
        readonly requester_user_id: string;
        readonly message: string | null;
        readonly state: string;
      }>(
        `select id::text as id, target, target_id::text as target_id, space_id::text as space_id,
                list_id::text as list_id, task_id::text as task_id, task_key,
                requester_user_id::text as requester_user_id, message, state
           from access_requests where organization_id = $1 order by created_at, id`,
        [atelierNordId],
      );
      expect(stored).toHaveLength(before + 5);
      expect(
        stored.map((row) => ({
          target: row.target,
          target_id: row.target_id,
          space_id: row.space_id,
          list_id: row.list_id,
          task_key: row.task_key,
          requester_user_id: row.requester_user_id,
          message: row.message,
          state: row.state,
        })),
      ).toEqual([
        {
          target: 'space',
          target_id: direction.id,
          space_id: direction.id,
          list_id: null,
          task_key: null,
          requester_user_id: lea.userId,
          message: 'Je dois chiffrer la part outillage du budget 2027.',
          state: 'pending',
        },
        {
          target: 'task',
          target_id: stored[1]?.task_id,
          space_id: produit.id,
          list_id: budget.id,
          task_key: budgetTask.key,
          requester_user_id: lea.userId,
          message: null,
          state: 'pending',
        },
        {
          target: 'list',
          target_id: budget.id,
          space_id: produit.id,
          list_id: budget.id,
          task_key: null,
          requester_user_id: nadia.userId,
          message: 'Pour suivre le budget',
          state: 'pending',
        },
        {
          target: 'list',
          target_id: directionList.id,
          space_id: direction.id,
          list_id: directionList.id,
          task_key: null,
          requester_user_id: hugo.userId,
          message: null,
          state: 'pending',
        },
        {
          target: 'space',
          target_id: direction.id,
          space_id: direction.id,
          list_id: null,
          task_key: null,
          requester_user_id: chloe.userId,
          message: null,
          state: 'pending',
        },
      ]);
      ['R1', 'R2', 'R3', 'R4', 'R5'].forEach((name, index) => {
        requests.set(name, stored[index]?.id ?? '');
      });

      const [spaceRequested] = await outboxOf('accessRequestId', requestId('R1'));
      expect(
        conforms(taskEventSchemas['space.access-requested.v1'], spaceRequested?.payload),
      ).toMatchObject({
        organizationId: atelierNordId,
        actor: { type: 'user', id: lea.userId },
        version: 1,
        accessRequestId: requestId('R1'),
        spaceId: direction.id,
        spaceName: 'Direction',
        spaceOwnerUserId: camille.userId,
        requesterUserId: lea.userId,
        message: 'Je dois chiffrer la part outillage du budget 2027.',
      });
      const [taskRequested] = await outboxOf('accessRequestId', requestId('R2'));
      expect(
        conforms(taskEventSchemas['task.access-requested.v1'], taskRequested?.payload),
      ).toMatchObject({
        version: 1,
        spaceId: produit.id,
        listId: budget.id,
        key: budgetTask.key,
        spaceName: 'Produit',
        listName: 'Budget 2027',
        name: 'Chiffrer l’outillage',
        spaceOwnerUserId: camille.userId,
        message: null,
      });
      const [listRequested] = await outboxOf('accessRequestId', requestId('R3'));
      expect(
        conforms(taskEventSchemas['list.access-requested.v1'], listRequested?.payload),
      ).toMatchObject({
        actor: { type: 'user', id: nadia.userId },
        listId: budget.id,
        listName: 'Budget 2027',
        requesterUserId: nadia.userId,
      });
      for (const name of ['R4', 'R5']) {
        expect(await outboxOf('accessRequestId', requestId(name))).toHaveLength(1);
      }
    });

    it('keeps one pending request per requester and target: asking again stores nothing and emits nothing', async () => {
      const before = await countRows('access_requests', 'true');
      const events = await asSystem<{ readonly total: number }>(
        `select count(*)::int as total from outbox_events where event_name like '%.access-requested.v1'`,
      );

      await ask(lea, { spaceId: direction.id, message: 'Autre message' });
      await ask(lea, { taskKey: budgetTask.key });

      expect(await countRows('access_requests', 'true')).toBe(before);
      expect(
        await asSystem<{ readonly total: number }>(
          `select count(*)::int as total from outbox_events where event_name like '%.access-requested.v1'`,
        ),
      ).toEqual(events);
      const [row] = await asSystem<{ readonly message: string }>(
        `select message from access_requests where organization_id = $1 and id = $2`,
        [atelierNordId, requestId('R1')],
      );
      expect(row?.message).toBe('Je dois chiffrer la part outillage du budget 2027.');
    });

    // The existence oracle: what a caller learns from a request must not depend on the target. The
    // three classes are a request that is stored (a private space Hugo has no role on), one that is
    // not (a space he sees) and one for an unknown id. Their status, the headers that could tell
    // (Location, ETag, Retry-After, the media type and the length) and the body are compared
    // exactly. Their time is compared as a class only: the median of 7 interleaved calls each, after
    // a warm-up round, must stay within a factor of 3 of the fastest median plus 25 ms of jitter. A
    // stored request does one insert and one outbox append more, which this bound accepts; an extra
    // round trip per class, or a lock wait, would not fit. Between calls the attempts of Hugo are
    // forgotten and his stored request deleted, so that each stored call stores again and no call
    // meets the hourly limit.
    it('answers a stored request, a request not stored and an unknown target alike: same status, headers and body, and the same timing class', async () => {
      const targets = {
        stored: direction.id,
        existing: produit.id,
        unknown: randomUUID(),
      } as const;
      const kinds = ['stored', 'existing', 'unknown'] as const;
      const timings: Record<(typeof kinds)[number], number[]> = {
        stored: [],
        existing: [],
        unknown: [],
      };
      const shapes: string[] = [];
      const reset = async (): Promise<void> => {
        await forgetAttempts(hugo);
        await asSystem(
          `delete from access_requests
            where organization_id = $1 and requester_user_id = $2 and target = 'space' and target_id = $3`,
          [atelierNordId, hugo.userId, direction.id],
        );
      };

      for (let round = 0; round <= 7; round += 1) {
        for (const kind of kinds) {
          await reset();
          const token = await tokenFor(hugo, {});
          const started = performance.now();
          const response = await build('post', '/internal/v1/access-requests', token, {
            body: { spaceId: targets[kind] },
          });
          const elapsed = performance.now() - started;
          shapes.push(
            JSON.stringify({
              status: response.status,
              text: response.text,
              location: response.headers.location ?? null,
              etag: response.headers.etag ?? null,
              retryAfter: response.headers['retry-after'] ?? null,
              contentType: response.headers['content-type'] ?? null,
              contentLength: response.headers['content-length'] ?? null,
            }),
          );
          expect(await pendingRequestOf(hugo, 'space', direction.id)).toEqual(
            kind === 'stored' ? expect.any(String) : undefined,
          );
          if (round > 0) {
            timings[kind].push(elapsed);
          }
        }
      }
      await reset();

      expect(new Set(shapes).size).toBe(1);
      expect(JSON.parse(shapes[0] ?? '{}') as unknown).toMatchObject({
        status: 202,
        text: '',
        location: null,
        etag: null,
        retryAfter: null,
      });
      const medians = kinds.map((kind) => median(timings[kind]));
      console.info(
        `access request timing medians (ms): ${kinds.map((kind, index) => `${kind} ${(medians[index] ?? 0).toFixed(1)}`).join(', ')}`,
      );
      expect(Math.max(...medians)).toBeLessThanOrEqual(Math.min(...medians) * 3 + 25);
    });

    it('refuses no target or two targets with 400 request.invalid, and counts no attempt', async () => {
      await forgetAttempts(lea);

      for (const body of [
        {},
        { spaceId: direction.id, listId: backlog.id },
        { message: 'Bonjour' },
      ]) {
        const response = await send('post', '/internal/v1/access-requests', lea, { body });
        expectProblem(response, 400, 'request.invalid', {
          issues: [expect.objectContaining({ in: 'body', path: '', code: 'custom' })],
        });
      }
      expect(await countRows('access_request_attempts', 'user_id = $2', lea.userId)).toBe(0);
    });

    it('refuses the eleventh request within the hour with 429 access-request.limit-reached, nextAvailableAt and Retry-After, counting the requests not stored', async () => {
      await forgetAttempts(ines);

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await ask(ines, { spaceId: randomUUID() });
      }
      const refused = await send('post', '/internal/v1/access-requests', ines, {
        body: { spaceId: direction.id },
      });
      const again = await send('post', '/internal/v1/access-requests', ines, {
        body: { spaceId: randomUUID() },
      });

      const [oldest] = await asSystem<{ readonly attempted_at: Date }>(
        `select attempted_at from access_request_attempts
          where organization_id = $1 and user_id = $2 order by attempted_at limit 1`,
        [atelierNordId, ines.userId],
      );
      const nextAvailableAt = new Date((oldest?.attempted_at.getTime() ?? 0) + 3_600_000);
      for (const response of [refused, again]) {
        expectProblem(response, 429, 'access-request.limit-reached', {
          nextAvailableAt: nextAvailableAt.toISOString(),
        });
        const retryAfter = Number(response.headers['retry-after']);
        expect(Number.isInteger(retryAfter)).toBe(true);
        expect(retryAfter).toBeGreaterThanOrEqual(1);
        expect(retryAfter).toBeLessThanOrEqual(3_600);
      }
      expect(await countRows('access_request_attempts', 'user_id = $2', ines.userId)).toBe(10);
      expect(await pendingRequestOf(ines, 'space', direction.id)).toBeUndefined();
      await forgetAttempts(ines);
    });

    it('lists the pending requests only to whoever answers their target, the most recent first, with the total on every page', async () => {
      await grant(camille, 'lists', budget.id, ines.userId, 'edit');
      const [r1, r2, r3, r4, r5] = ['R1', 'R2', 'R3', 'R4', 'R5'].map(requestId);

      const all = await pendingSeenBy(camille);
      expect(all.items.map((item) => item.id)).toEqual([r5, r4, r3, r2, r1]);
      expect(all).toMatchObject({ total: 5, nextCursor: null });
      expect(all.items.find((item) => item.id === r1)).toEqual({
        id: r1,
        target: 'space',
        spaceId: direction.id,
        listId: null,
        task: null,
        requester: { userId: lea.userId },
        message: 'Je dois chiffrer la part outillage du budget 2027.',
        state: 'pending',
        role: null,
        createdAt: expect.any(String) as unknown,
        decidedAt: null,
        decidedBy: null,
      });
      expect(all.items.find((item) => item.id === r2)).toMatchObject({
        target: 'task',
        spaceId: produit.id,
        listId: budget.id,
        task: { key: budgetTask.key, name: 'Chiffrer l’outillage', status: 'todo' },
      });

      const walked: string[] = [];
      let cursor: string | null = null;
      do {
        const page: z.output<typeof ListAccessRequestsInternalResponse> = await pendingSeenBy(
          camille,
          cursor === null ? 'limit=2' : `limit=2&cursor=${encodeURIComponent(cursor)}`,
        );
        expect(page.total).toBe(5);
        walked.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor !== null);
      expect(walked).toEqual([r5, r4, r3, r2, r1]);

      const ofDirection = await pendingSeenBy(camille, `spaceId=${direction.id}`);
      expect(ofDirection.items.map((item) => item.id)).toEqual([r5, r4, r1]);
      expect(ofDirection.total).toBe(3);
      const ofBudget = await pendingSeenBy(camille, `listId=${budget.id}`);
      expect(ofBudget.items.map((item) => item.id)).toEqual([r3, r2]);
      expect(ofBudget.total).toBe(2);
      expect(
        (await pendingSeenBy(camille, `spaceId=${produit.id}`)).items.map((item) => item.id),
      ).toEqual([r3, r2]);

      const ofInes = await pendingSeenBy(ines);
      expect(ofInes.items.map((item) => item.id)).toEqual([r3, r2]);
      expect(ofInes.total).toBe(2);
      expect(ofInes.items.find((item) => item.id === r2)?.task).toEqual({
        key: budgetTask.key,
        name: 'Chiffrer l’outillage',
        status: 'todo',
      });
      for (const viewer of [lea, hugo, nadia]) {
        expect(await pendingSeenBy(viewer)).toEqual({ items: [], nextCursor: null, total: 0 });
      }
    });

    it('approves a space request with a role: the grant is given, the requester sees the space, and the access and the decision are announced', async () => {
      const r1 = requestId('R1');
      const eventsBefore = (await outboxOf('spaceId', direction.id)).length;

      const response = await send('post', `/internal/v1/access-requests/${r1}/approval`, camille, {
        body: { role: 'view' },
      });

      expect(response.status).toBe(200);
      expect(conforms(ApproveAccessRequestInternalResponse, bodyOf(response))).toMatchObject({
        id: r1,
        target: 'space',
        state: 'approved',
        role: 'view',
        decidedBy: { type: 'user', id: camille.userId },
        decidedAt: expect.any(String) as unknown,
      });
      expect(await readSpace(lea, direction.id)).toMatchObject({
        callerRole: 'view',
        callerCanManage: false,
      });
      const events = await outboxSince('spaceId', direction.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual([
        'space.access-changed.v1',
        'space.access-request-decided.v1',
      ]);
      expect(
        conforms(taskEventSchemas['space.access-changed.v1'], events[0]?.payload),
      ).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        grants: [{ userId: lea.userId, role: 'view' }],
        changedUserIds: [lea.userId],
      });
      expect(
        conforms(taskEventSchemas['space.access-request-decided.v1'], events[1]?.payload),
      ).toMatchObject({
        actor: { type: 'user', id: camille.userId },
        version: 2,
        accessRequestId: r1,
        spaceId: direction.id,
        requesterUserId: lea.userId,
        decision: 'approved',
        role: 'view',
      });
      expect((await pendingSeenBy(camille)).total).toBe(4);
    });

    it('approves a task request as a grant of its list', async () => {
      const r2 = requestId('R2');
      const eventsBefore = (await outboxOf('listId', budget.id)).length;

      const response = await send('post', `/internal/v1/access-requests/${r2}/approval`, ines, {
        body: { role: 'comment' },
      });

      expect(response.status).toBe(200);
      expect(conforms(ApproveAccessRequestInternalResponse, bodyOf(response))).toMatchObject({
        id: r2,
        target: 'task',
        listId: budget.id,
        task: { key: budgetTask.key },
        state: 'approved',
        role: 'comment',
        decidedBy: { type: 'user', id: ines.userId },
      });
      expect(await readList(lea, budget.id)).toMatchObject({ callerRole: 'comment' });
      expect(
        await read(GetTaskInternalResponse, `/internal/v1/tasks/${budgetTask.key}`, lea),
      ).toMatchObject({ key: budgetTask.key });
      const events = await outboxSince('listId', budget.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual([
        'list.access-changed.v1',
        'task.access-request-decided.v1',
      ]);
      expect(
        conforms(taskEventSchemas['list.access-changed.v1'], events[0]?.payload),
      ).toMatchObject({
        actor: { type: 'user', id: ines.userId },
        changed: ['grants'],
        changedUserIds: [lea.userId],
      });
      expect(
        conforms(taskEventSchemas['task.access-request-decided.v1'], events[1]?.payload),
      ).toMatchObject({
        version: 2,
        accessRequestId: r2,
        key: budgetTask.key,
        decision: 'approved',
        role: 'comment',
      });
    });

    it('never lowers a grant given meanwhile: an approval with view keeps the edit Nadia was given', async () => {
      const r3 = requestId('R3');
      await grant(camille, 'lists', budget.id, nadia.userId, 'edit');
      const eventsBefore = (await outboxOf('listId', budget.id)).length;

      const response = await send('post', `/internal/v1/access-requests/${r3}/approval`, camille, {
        body: { role: 'view' },
      });

      expect(response.status).toBe(200);
      expect(conforms(ApproveAccessRequestInternalResponse, bodyOf(response))).toMatchObject({
        id: r3,
        target: 'list',
        state: 'approved',
        role: 'view',
      });
      const grants = await read(
        ListListGrantsInternalResponse,
        `/internal/v1/lists/${budget.id}/grants`,
        camille,
      );
      expect(grants.items.find((item) => item.userId === nadia.userId)).toMatchObject({
        role: 'edit',
      });
      const events = await outboxSince('listId', budget.id, eventsBefore);
      expect(events.map((event) => event.event_name)).toEqual(['list.access-request-decided.v1']);
      expect(
        conforms(taskEventSchemas['list.access-request-decided.v1'], events[0]?.payload),
      ).toMatchObject({ version: 2, decision: 'approved', role: 'view' });
    });

    it('refuses a request: the answer is announced and nothing else changes', async () => {
      const r4 = requestId('R4');
      const grantsBefore = await countRows('list_grants', 'list_id = $2', directionList.id);

      const response = await send('post', `/internal/v1/access-requests/${r4}/refusal`, camille, {
        body: {},
      });

      expect(response.status).toBe(200);
      expect(conforms(RefuseAccessRequestInternalResponse, bodyOf(response))).toMatchObject({
        id: r4,
        target: 'list',
        listId: directionList.id,
        state: 'refused',
        role: null,
        decidedBy: { type: 'user', id: camille.userId },
      });
      expectProblem(
        await send('get', `/internal/v1/lists/${directionList.id}`, hugo),
        404,
        'list.not-found',
      );
      expect(await countRows('list_grants', 'list_id = $2', directionList.id)).toBe(grantsBefore);
      const events = await outboxOf('accessRequestId', r4);
      expect(events.map((event) => event.event_name)).toEqual([
        'list.access-requested.v1',
        'list.access-request-decided.v1',
      ]);
      expect(
        conforms(taskEventSchemas['list.access-request-decided.v1'], events[1]?.payload),
      ).toMatchObject({
        version: 2,
        decision: 'refused',
        role: null,
        requesterUserId: hugo.userId,
      });
    });

    it('answers a second answer with 409 access-request.already-decided and the state', async () => {
      const r1 = requestId('R1');
      const r4 = requestId('R4');

      for (const [id, state] of [
        [r1, 'approved'],
        [r4, 'refused'],
      ] as const) {
        expectProblem(
          await send('post', `/internal/v1/access-requests/${id}/approval`, camille, {
            body: { role: 'edit' },
          }),
          409,
          'access-request.already-decided',
          { state },
        );
        expectProblem(
          await send('post', `/internal/v1/access-requests/${id}/refusal`, camille, { body: {} }),
          409,
          'access-request.already-decided',
          { state },
        );
      }
      expect(
        await countRows('space_grants', 'space_id = $2 and user_id = $3', direction.id, lea.userId),
      ).toBe(1);
    });

    it('answers 404 access-request.not-found to whoever does not answer the target, and for an unknown id', async () => {
      const r5 = requestId('R5');

      for (const viewer of [lea, ines, hugo]) {
        expectProblem(
          await send('post', `/internal/v1/access-requests/${r5}/approval`, viewer, {
            body: { role: 'view' },
          }),
          404,
          'access-request.not-found',
        );
        expectProblem(
          await send('post', `/internal/v1/access-requests/${r5}/refusal`, viewer, { body: {} }),
          404,
          'access-request.not-found',
        );
      }
      const unknown = randomUUID();
      expectProblem(
        await send('post', `/internal/v1/access-requests/${unknown}/approval`, camille, {
          body: { role: 'view' },
        }),
        404,
        'access-request.not-found',
      );
      expectProblem(
        await send('post', `/internal/v1/access-requests/${unknown}/refusal`, camille, {
          body: {},
        }),
        404,
        'access-request.not-found',
      );
      expect(await pendingRequestOf(chloe, 'space', direction.id)).toBe(r5);
    });

    it('refuses with 422 access.guest-space-forbidden the approval of a space request whose requester became a guest meanwhile', async () => {
      const r5 = requestId('R5');
      await deliver(toPublishedEvent('role-changed', atelierNordId, chloe, 'guest', 2, 'member'));

      expectProblem(
        await send('post', `/internal/v1/access-requests/${r5}/approval`, camille, {
          body: { role: 'view' },
        }),
        422,
        'access.guest-space-forbidden',
      );

      expect(await pendingRequestOf(chloe, 'space', direction.id)).toBe(r5);
      expect(
        await countRows(
          'space_grants',
          'space_id = $2 and user_id = $3',
          direction.id,
          chloe.userId,
        ),
      ).toBe(0);
      expect(await outboxOf('accessRequestId', r5)).toHaveLength(1);
      const refused = await send('post', `/internal/v1/access-requests/${r5}/refusal`, camille, {
        body: {},
      });
      expect(refused.status).toBe(200);
      expect(conforms(RefuseAccessRequestInternalResponse, bodyOf(refused)).state).toBe('refused');
    });

    it('stores a request of Léa for the private space "Carnet" of Hugo, for the clean-up to drop', async () => {
      await ask(lea, { spaceId: carnet.id, message: 'Pour relire les notes' });

      const id = await pendingRequestOf(lea, 'space', carnet.id);
      expect(id).toEqual(expect.any(String));
      requests.set('R6', id ?? '');
      const ofHugo = await pendingSeenBy(hugo);
      expect(ofHugo.items.map((item: AccessRequestBody) => item.id)).toEqual([requestId('R6')]);
    });

    it('follows a task request to the current list of its task: the editors of the new list read and approve it, the grant is on the new list, and the editors of the former list no longer answer it', async () => {
      const achats = await createList(camille, produit.id, {
        name: 'Achats',
        organizationAccess: false,
      });
      const fournisseurs = await createList(camille, produit.id, {
        name: 'Fournisseurs',
        organizationAccess: false,
      });
      await grant(camille, 'lists', achats.id, ines.userId, 'edit');
      await grant(camille, 'lists', fournisseurs.id, hugo.userId, 'edit');
      const screens = await createTask(camille, achats.id, { name: 'Commander les écrans' });
      await forgetAttempts(mathis);
      await ask(mathis, { taskKey: screens.key, message: 'Pour suivre la commande' });
      const [stored] = await asSystem<{ readonly id: string; readonly list_id: string }>(
        `select id::text as id, list_id::text as list_id from access_requests
          where organization_id = $1 and requester_user_id = $2 and target = 'task' and task_key = $3
            and state = 'pending'`,
        [atelierNordId, mathis.userId, screens.key],
      );
      const r7 = stored?.id ?? '';
      expect(stored?.list_id).toBe(achats.id);
      expect((await pendingSeenBy(ines)).items.find((item) => item.id === r7)).toMatchObject({
        target: 'task',
        spaceId: produit.id,
        listId: achats.id,
        task: { key: screens.key, name: 'Commander les écrans', status: 'todo' },
      });
      expect((await pendingSeenBy(hugo)).items.map((item) => item.id)).not.toContain(r7);

      const moved = await send('patch', `/internal/v1/tasks/${screens.key}`, camille, {
        body: { listId: fournisseurs.id },
      });
      expect(moved.status).toBe(200);
      expect(conforms(UpdateTaskInternalResponse, bodyOf(moved)).listId).toBe(fournisseurs.id);

      const ofHugo = await pendingSeenBy(hugo);
      expect(ofHugo.items.map((item) => item.id)).toEqual([r7, requestId('R6')]);
      expect(ofHugo.items[0]).toMatchObject({ listId: fournisseurs.id, spaceId: produit.id });
      expect(await pendingSeenBy(hugo, `listId=${fournisseurs.id}`)).toMatchObject({
        total: 1,
        items: [{ id: r7 }],
      });
      expect((await pendingSeenBy(ines)).items.map((item) => item.id)).not.toContain(r7);
      expect((await pendingSeenBy(camille, `listId=${achats.id}`)).total).toBe(0);
      expectProblem(
        await send('post', `/internal/v1/access-requests/${r7}/approval`, ines, {
          body: { role: 'view' },
        }),
        404,
        'access-request.not-found',
      );
      expectProblem(
        await send('post', `/internal/v1/access-requests/${r7}/refusal`, ines, { body: {} }),
        404,
        'access-request.not-found',
      );
      const fournisseursEvents = (await outboxOf('listId', fournisseurs.id)).length;

      const approved = await send('post', `/internal/v1/access-requests/${r7}/approval`, hugo, {
        body: { role: 'view' },
      });

      expect(approved.status).toBe(200);
      expect(conforms(ApproveAccessRequestInternalResponse, bodyOf(approved))).toMatchObject({
        id: r7,
        target: 'task',
        spaceId: produit.id,
        listId: fournisseurs.id,
        task: { key: screens.key },
        requester: { userId: mathis.userId },
        state: 'approved',
        role: 'view',
        decidedBy: { type: 'user', id: hugo.userId },
      });
      expect(await readList(mathis, fournisseurs.id)).toMatchObject({ callerRole: 'view' });
      expectProblem(
        await send('get', `/internal/v1/lists/${achats.id}`, mathis),
        404,
        'list.not-found',
      );
      expect(
        await read(GetTaskInternalResponse, `/internal/v1/tasks/${screens.key}`, mathis),
      ).toMatchObject({ key: screens.key, listId: fournisseurs.id });
      expect(
        await countRows('list_grants', 'list_id = $2 and user_id = $3', achats.id, mathis.userId),
      ).toBe(0);
      const events = await outboxOf('accessRequestId', r7);
      expect(events.map((event) => event.event_name)).toEqual([
        'task.access-requested.v1',
        'task.access-request-decided.v1',
      ]);
      expect(
        conforms(taskEventSchemas['task.access-requested.v1'], events[0]?.payload),
      ).toMatchObject({ listId: achats.id, key: screens.key, message: 'Pour suivre la commande' });
      expect(
        conforms(taskEventSchemas['task.access-request-decided.v1'], events[1]?.payload),
      ).toMatchObject({
        actor: { type: 'user', id: hugo.userId },
        version: 2,
        spaceId: produit.id,
        listId: fournisseurs.id,
        key: screens.key,
        requesterUserId: mathis.userId,
        decision: 'approved',
        role: 'view',
      });
      const granted = await outboxSince('listId', fournisseurs.id, fournisseursEvents);
      expect(granted.map((event) => event.event_name)).toEqual([
        'list.access-changed.v1',
        'task.access-request-decided.v1',
      ]);
      expect(
        conforms(taskEventSchemas['list.access-changed.v1'], granted[0]?.payload),
      ).toMatchObject({
        actor: { type: 'user', id: hugo.userId },
        listId: fournisseurs.id,
        changed: ['grants'],
        changedUserIds: [mathis.userId],
      });
    });

    it('answers 404 access-request.not-found to the approval and the refusal of a request whose requester was removed meanwhile, while the clean-up has not dropped it yet', async () => {
      await grant(hugo, 'spaces', carnet.id, noe.userId, 'view');
      await ask(noe, { spaceId: direction.id, message: 'Pour préparer le comité' });
      const id = await pendingRequestOf(noe, 'space', direction.id);
      expect(id).toEqual(expect.any(String));

      // The batch of his grants waits on "Carnet" while it is held, so his request is still there
      // when Camille answers it.
      await whileSpaceHeld(carnet.id, async () => {
        await deliver(toPublishedEvent('removed', atelierNordId, noe, 'member', 2));

        expectProblem(
          await send('post', `/internal/v1/access-requests/${id ?? ''}/approval`, camille, {
            body: { role: 'view' },
          }),
          404,
          'access-request.not-found',
        );
        expectProblem(
          await send('post', `/internal/v1/access-requests/${id ?? ''}/refusal`, camille, {
            body: {},
          }),
          404,
          'access-request.not-found',
        );
        expect(await pendingRequestOf(noe, 'space', direction.id)).toBe(id);
        expect(
          await countRows(
            'space_grants',
            'space_id = $2 and user_id = $3',
            direction.id,
            noe.userId,
          ),
        ).toBe(0);
        expect(await outboxOf('accessRequestId', id ?? '')).toHaveLength(1);
      });

      await cleanUpsCompleted(noe, 1);
      expect(await countRows('access_requests', 'requester_user_id = $2', noe.userId)).toBe(0);
      expect(await countRows('space_grants', 'user_id = $2', noe.userId)).toBe(0);
    }, 240_000);

    it('refuses with 422 access.grant-limit-reached the approval of a request for a list that holds 200 grants, and keeps the request pending', async () => {
      const salon = await createList(camille, produit.id, {
        name: 'Salon professionnel',
        organizationAccess: false,
      });
      await asSystem(
        `insert into list_grants
           (organization_id, list_id, space_id, user_id, role, granted_by_type, granted_by_id)
         select $1, $2, $3, gen_random_uuid(), 'view', 'user', $4 from generate_series(1, 200)`,
        [atelierNordId, salon.id, produit.id, camille.userId],
      );
      await forgetAttempts(chloe);
      await ask(chloe, { listId: salon.id });
      const id = await pendingRequestOf(chloe, 'list', salon.id);
      expect(id).toEqual(expect.any(String));

      expectProblem(
        await send('post', `/internal/v1/access-requests/${id ?? ''}/approval`, camille, {
          body: { role: 'view' },
        }),
        422,
        'access.grant-limit-reached',
      );

      expect(await pendingRequestOf(chloe, 'list', salon.id)).toBe(id);
      expect(await countRows('list_grants', 'list_id = $2', salon.id)).toBe(200);
      expect(await outboxOf('accessRequestId', id ?? '')).toHaveLength(1);
      expect((await readList(camille, salon.id)).version).toBe(1);
      const refused = await send(
        'post',
        `/internal/v1/access-requests/${id ?? ''}/refusal`,
        camille,
        { body: {} },
      );
      expect(refused.status).toBe(200);
      expect(conforms(RefuseAccessRequestInternalResponse, bodyOf(refused)).state).toBe('refused');
    });

    it('serializes the requests of one member: 15 sent at once answer exactly ten 202 and five 429, and count ten attempts', async () => {
      await forgetAttempts(ines);

      const responses = await Promise.all(
        Array.from({ length: 15 }, () =>
          send('post', '/internal/v1/access-requests', ines, { body: { spaceId: randomUUID() } }),
        ),
      );

      expect(responses.filter((response) => response.status === 202)).toHaveLength(10);
      const refused = responses.filter((response) => response.status === 429);
      expect(refused).toHaveLength(5);
      for (const response of refused) {
        expectProblem(response, 429, 'access-request.limit-reached');
      }
      expect(await countRows('access_request_attempts', 'user_id = $2', ines.userId)).toBe(10);
      await forgetAttempts(ines);
    });
  });

  describe('the access checks of the realtime gateway', () => {
    it('answers the role of the actor on a list and on a task to the realtime gateway', async () => {
      const realtime = { issuer: 'realtime-gateway' } as const;
      for (const [viewer, listId, spaceId, role] of [
        [lea, entretiens.id, recherche.id, 'view'],
        [hugo, entretiens.id, recherche.id, 'edit'],
        [nadia, sprint14.id, produit.id, 'edit'],
        [lea, budget.id, produit.id, 'comment'],
      ] as const) {
        const response = await send('get', `/internal/v1/lists/${listId}/access`, viewer, realtime);
        expect(response.status).toBe(200);
        expect(conforms(CheckListAccessInternalResponse, bodyOf(response))).toEqual({
          role,
          spaceId,
          listId,
          taskKey: null,
        });
      }
      for (const [viewer, task, role] of [
        [lea, entretiensTask, 'view'],
        [hugo, entretiensTask, 'edit'],
        [nadia, calendarTask, 'edit'],
      ] as const) {
        const response = await send(
          'get',
          `/internal/v1/tasks/${task.key}/access`,
          viewer,
          realtime,
        );
        expect(response.status).toBe(200);
        expect(conforms(CheckTaskAccessInternalResponse, bodyOf(response))).toEqual({
          role,
          spaceId: task.spaceId,
          listId: task.listId,
          taskKey: task.key,
        });
      }
    });

    it('answers 404 for anything the actor does not see, an unknown list or task included', async () => {
      const realtime = { issuer: 'realtime-gateway' } as const;

      expectProblem(
        await send('get', `/internal/v1/lists/${entretiens.id}/access`, camille, realtime),
        404,
        'list.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/lists/${randomUUID()}/access`, lea, realtime),
        404,
        'list.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/lists/${backlog.id}/access`, nadia, realtime),
        404,
        'list.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${entretiensTask.key}/access`, camille, realtime),
        404,
        'task.not-found',
      );
      expectProblem(
        await send('get', '/internal/v1/tasks/RCH-999/access', hugo, realtime),
        404,
        'task.not-found',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${demoTask.key}/access`, nadia, realtime),
        404,
        'task.not-found',
      );
    });

    it('refuses a token of the API gateway on the access checks, and a token of the realtime gateway everywhere else, with 403 auth.issuer-not-allowed', async () => {
      expectProblem(
        await send('get', `/internal/v1/lists/${entretiens.id}/access`, lea),
        403,
        'auth.issuer-not-allowed',
      );
      expectProblem(
        await send('get', `/internal/v1/tasks/${entretiensTask.key}/access`, lea),
        403,
        'auth.issuer-not-allowed',
      );
      const realtime = { issuer: 'realtime-gateway' } as const;
      for (const [method, path, body] of [
        ['get', '/internal/v1/spaces', undefined],
        ['get', `/internal/v1/spaces/${recherche.id}`, undefined],
        ['get', `/internal/v1/lists/${entretiens.id}`, undefined],
        ['get', `/internal/v1/tasks/${entretiensTask.key}`, undefined],
        ['get', `/internal/v1/spaces/${recherche.id}/grants`, undefined],
        ['get', `/internal/v1/lists/${entretiens.id}/grants`, undefined],
        ['put', `/internal/v1/lists/${entretiens.id}/grants/${mathis.userId}`, { role: 'view' }],
        ['get', '/internal/v1/access-requests', undefined],
        ['post', '/internal/v1/access-requests', { spaceId: direction.id }],
      ] as const) {
        expectProblem(
          await send(method, path, hugo, { ...realtime, ...(body === undefined ? {} : { body }) }),
          403,
          'auth.issuer-not-allowed',
        );
      }
    });
  });

  describe('row-level security keeps the grants and the access requests of each organization to it', () => {
    const tables = ['space_grants', 'list_grants', 'access_requests', 'access_request_attempts'];

    it('shows the second organization none of the rows of Atelier Nord in the four tables', async () => {
      const boutique = await createSpace(
        solene,
        { name: 'Boutique', prefix: 'BOU' },
        atelierDeltaId,
      );
      const other = randomUUID();
      await asSystem(
        `insert into space_grants (organization_id, space_id, user_id, role, granted_by_type, granted_by_id)
         values ($1, $2, $3, 'view', 'user', $4)`,
        [atelierDeltaId, boutique.space.id, other, solene.userId],
      );
      await asSystem(
        `insert into list_grants (organization_id, list_id, space_id, user_id, role, granted_by_type, granted_by_id)
         values ($1, $2, $3, $4, 'view', 'user', $5)`,
        [atelierDeltaId, boutique.firstList.id, boutique.space.id, other, solene.userId],
      );
      await asSystem(
        `insert into access_requests (organization_id, target, target_id, space_id, requester_user_id)
         values ($1, 'space', $2, $2, $3)`,
        [atelierDeltaId, boutique.space.id, other],
      );
      await asSystem(
        `insert into access_request_attempts (organization_id, user_id) values ($1, $2)`,
        [atelierDeltaId, other],
      );

      for (const table of tables) {
        const [stored] = await asSystem<{ readonly total: number }>(
          `select count(*)::int as total from ${table} where organization_id = $1`,
          [atelierNordId],
        );
        expect(stored?.total, table).toBeGreaterThan(0);
        const seen = await inTenant(atelierDeltaId, async (client) => {
          const result = await client.query(
            `select distinct organization_id::text as organization_id from ${table}`,
          );
          return (result.rows as readonly { readonly organization_id: string }[]).map(
            (row) => row.organization_id,
          );
        });
        expect(seen, table).toEqual([atelierDeltaId]);
        const ofAtelierNord = await inTenant(atelierDeltaId, async (client) => {
          const result = await client.query(
            `select count(*)::int as total from ${table} where organization_id = $1`,
            [atelierNordId],
          );
          return result.rows;
        });
        expect(ofAtelierNord, table).toEqual([{ total: 0 }]);
      }
    });

    it('refuses with 42501 a row of Atelier Nord written from a tenant transaction of the second organization', async () => {
      const intruder = randomUUID();
      const writes: readonly {
        readonly table: string;
        readonly sql: string;
        readonly params: unknown[];
      }[] = [
        {
          table: 'space_grants',
          sql: `insert into space_grants (organization_id, space_id, user_id, role, granted_by_type, granted_by_id)
                values ($1, $2, $3, 'edit', 'user', $4)`,
          params: [atelierNordId, produit.id, intruder, intruder],
        },
        {
          table: 'list_grants',
          sql: `insert into list_grants (organization_id, list_id, space_id, user_id, role, granted_by_type, granted_by_id)
                values ($1, $2, $3, $4, 'edit', 'user', $5)`,
          params: [atelierNordId, backlog.id, produit.id, intruder, intruder],
        },
        {
          table: 'access_requests',
          sql: `insert into access_requests (organization_id, target, target_id, space_id, requester_user_id)
                values ($1, 'space', $2, $2, $3)`,
          params: [atelierNordId, produit.id, intruder],
        },
        {
          table: 'access_request_attempts',
          sql: `insert into access_request_attempts (organization_id, user_id) values ($1, $2)`,
          params: [atelierNordId, intruder],
        },
      ];

      for (const write of writes) {
        await expect(
          inTenant(atelierDeltaId, (client) => client.query(write.sql, write.params)),
          write.table,
        ).rejects.toMatchObject({ code: '42501' });
      }
      for (const table of ['space_grants', 'list_grants', 'access_request_attempts'] as const) {
        expect(await countRows(table, 'user_id = $2', intruder), table).toBe(0);
      }
      expect(await countRows('access_requests', 'requester_user_id = $2', intruder)).toBe(0);
    });

    it('forces row-level security on the four tables, for their owner too', async () => {
      const rows = await asSystem<{
        readonly relname: string;
        readonly relrowsecurity: boolean;
        readonly relforcerowsecurity: boolean;
      }>(
        `select relname, relrowsecurity, relforcerowsecurity from pg_class
          where relname = any($1::text[]) and relkind = 'r' order by relname`,
        [tables],
      );
      expect(rows).toEqual(
        [...tables].sort().map((relname) => ({
          relname,
          relrowsecurity: true,
          relforcerowsecurity: true,
        })),
      );
    });
  });

  describe('when a member leaves, the clean-up job removes their grants and drops their access requests', () => {
    const outcomes: { readonly userId: string; readonly output: CleanUpRemovedMemberOutput }[] = [];
    let restore: (() => void) | undefined;

    afterAll(() => {
      restore?.();
    });

    it('removes the 134 grants of Léa in batches, each with its access event by the system in the trace of the job, drops her requests, pending and answered, and her attempts, and unassigns her tasks', async () => {
      // The outcome of each run of the clean-up, as the job handler receives it.
      const useCase = service().get(CleanUpRemovedMember);
      const original = useCase.execute.bind(useCase);
      const spy = vi
        .spyOn(useCase, 'execute')
        .mockImplementation(
          async (input: CleanUpRemovedMemberInput): Promise<CleanUpRemovedMemberOutput> => {
            const output = await original(input);
            outcomes.push({ userId: input.userId, output });
            return output;
          },
        );
      restore = (): void => {
        spy.mockRestore();
      };
      const archives = (await createSpace(camille, { name: 'Archives', prefix: 'ARV' })).space;
      // 130 lists of an import, each shared with Léa, so that the grants take two batches.
      await asSystem(
        `insert into lists (organization_id, space_id, name, color)
         select $1, $2, 'Archive ' || n, 'gris' from generate_series(1, 130) as n`,
        [atelierNordId, archives.id],
      );
      await asSystem(
        `insert into list_grants (organization_id, list_id, space_id, user_id, role, granted_by_type, granted_by_id)
         select organization_id, id, space_id, $3, 'view', 'user', $4
           from lists where organization_id = $1 and space_id = $2 and name like 'Archive %'`,
        [atelierNordId, archives.id, lea.userId, camille.userId],
      );
      // "Recherche" (view), "Communauté" (edit) and "Direction" (view, the approved request), then
      // "Budget 2027" (comment, the approved task request) and the 130 lists of the import.
      expect(await countRows('space_grants', 'user_id = $2', lea.userId)).toBe(3);
      expect(await countRows('list_grants', 'user_id = $2', lea.userId)).toBe(131);
      expect(
        await countRows(
          'access_requests',
          `requester_user_id = $2 and state = 'pending'`,
          lea.userId,
        ),
      ).toBe(1);
      // Her request for "Carnet" waits; the two the owners answered stay until she leaves.
      expect(
        await countRows(
          'access_requests',
          `requester_user_id = $2 and state = 'approved'`,
          lea.userId,
        ),
      ).toBe(2);
      expect(
        await countRows('access_request_attempts', 'user_id = $2', lea.userId),
      ).toBeGreaterThan(0);
      const assigned = await countRows('task_assignees', 'user_id = $2', lea.userId);
      expect(assigned).toBeGreaterThanOrEqual(3);
      const [lastBefore] = await asSystem<{ readonly id: string }>(
        `select id::text as id from outbox_events order by id desc limit 1`,
      );

      await deliver(toPublishedEvent('removed', atelierNordId, lea, 'member', 2));
      await cleanUpsCompleted(lea, 1);

      expect(await countRows('space_grants', 'user_id = $2', lea.userId)).toBe(0);
      expect(await countRows('list_grants', 'user_id = $2', lea.userId)).toBe(0);
      expect(
        await countRows(
          'access_requests',
          `requester_user_id = $2 and state = 'pending'`,
          lea.userId,
        ),
      ).toBe(0);
      // The answered requests go too: they hold her message.
      expect(await countRows('access_requests', 'requester_user_id = $2', lea.userId)).toBe(0);
      expect(await countRows('access_request_attempts', 'user_id = $2', lea.userId)).toBe(0);
      expect(await countRows('task_assignees', 'user_id = $2', lea.userId)).toBe(0);

      const events = await asSystem<OutboxRow & { readonly traceparent: string | null }>(
        `select id::text as id, event_name, payload, traceparent from outbox_events
          where id > $1::uuid and event_name in ('space.access-changed.v1', 'list.access-changed.v1')
          order by id`,
        [lastBefore?.id],
      );
      expect(events).toHaveLength(134);
      // The job stored the traceparent of the delivery of the removal, and the rows it appended
      // continue that trace: the same trace id, another span.
      const [job] = await cleanUpJobsOf(lea);
      const stored = job?.traceparent ?? '';
      expect(stored).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/u);
      for (const event of events) {
        expect(event.traceparent?.split('-')[1]).toBe(stored.split('-')[1]);
        expect(event.traceparent).not.toBe(stored);
      }
      for (const event of events) {
        const payload = conforms(
          event.event_name === 'space.access-changed.v1'
            ? taskEventSchemas['space.access-changed.v1']
            : taskEventSchemas['list.access-changed.v1'],
          event.payload,
        );
        expect(payload).toMatchObject({
          organizationId: atelierNordId,
          actor: { type: 'system', id: 'task-service' },
          changedUserIds: [lea.userId],
        });
        expect(payload.grants.map((item) => item.userId)).not.toContain(lea.userId);
      }
      expect(events.filter((event) => event.event_name === 'space.access-changed.v1')).toHaveLength(
        3,
      );
      const ofRecherche = (await outboxOf('spaceId', recherche.id))
        .filter((event) => event.event_name === 'space.access-changed.v1')
        .at(-1);
      expect(
        conforms(taskEventSchemas['space.access-changed.v1'], ofRecherche?.payload),
      ).toMatchObject({
        actor: { type: 'system', id: 'task-service' },
        version: recherche.version + 1,
        grants: [
          { userId: ines.userId, role: 'comment' },
          { userId: mathis.userId, role: 'edit' },
        ],
        changedUserIds: [lea.userId],
      });
      expect(outcomes.filter((outcome) => outcome.userId === lea.userId)).toEqual([
        {
          userId: lea.userId,
          output: {
            outcome: 'completed',
            spacesHandedOver: 0,
            spacesAwaitingOwner: 0,
            grantsRemoved: 134,
            requestsDropped: 3,
            tasksUnassigned: assigned,
            watcherOverridesRemoved: 0,
            batches: 4,
          },
        },
      ]);
      recherche = await readSpace(hugo, recherche.id);
    }, 240_000);

    it('keeps the grants of Léa when she joins again before the job reaches them, and the job ends member-again', async () => {
      const again: Person = { userId: lea.userId, memberId: leaSecondMemberId };
      await deliver(toPublishedEvent('joined', atelierNordId, again, 'member', 1));
      await grant(hugo, 'spaces', recherche.id, lea.userId, 'view');
      await grant(camille, 'lists', budget.id, lea.userId, 'comment');
      outcomes.length = 0;

      // The batch of the grants locks the spaces of the grants, "Produit" then "Recherche": while
      // "Recherche" is held its attempt fails on the lock timeout (5 s), and Léa joins again before
      // the retry.
      await whileSpaceHeld(recherche.id, async () => {
        await deliver(toPublishedEvent('removed', atelierNordId, again, 'member', 2));
        await vi.waitFor(
          async () => {
            const jobs = await cleanUpJobsOf(lea);
            expect(jobs).toHaveLength(2);
            expect(jobs[1]).toMatchObject({ state: 'retry' });
          },
          { timeout: 60_000, interval: 250 },
        );
        await deliver(
          toPublishedEvent(
            'joined',
            atelierNordId,
            { userId: lea.userId, memberId: leaThirdMemberId },
            'member',
            1,
          ),
        );
      });
      await cleanUpsCompleted(lea, 2);

      expect(await countRows('space_grants', 'user_id = $2', lea.userId)).toBe(1);
      expect(await countRows('list_grants', 'user_id = $2', lea.userId)).toBe(1);
      expect(await readSpace(lea, recherche.id)).toMatchObject({ callerRole: 'view' });
      expect(await readList(lea, budget.id)).toMatchObject({ callerRole: 'comment' });
      expect(outcomes.at(-1)).toEqual({
        userId: lea.userId,
        output: {
          outcome: 'member-again',
          spacesHandedOver: 0,
          spacesAwaitingOwner: 0,
          grantsRemoved: 0,
          requestsDropped: 0,
          tasksUnassigned: 0,
          watcherOverridesRemoved: 0,
          batches: 0,
        },
      });
    }, 240_000);
  });

  describe('the statements of the access model keep to their indexes on a realistic volume', () => {
    /** How much of each a seeded organization holds. */
    interface VolumeShape {
      readonly owners: number;
      readonly spaces: number;
      readonly listsPerSpace: number;
      readonly spaceGrants: number;
      readonly listGrants: number;
      readonly pending: number;
      readonly decided: number;
      readonly attempts: number;
    }

    /** The ranked lists of the seeded spaces of an organization, `$1`, as a subquery. */
    const seededLists = `(select li.organization_id, li.id, li.space_id, li.created_at, sp.owner_user_id,
                                 row_number() over (order by li.created_at, li.id) - 1 as rank
                            from lists as li
                            join spaces as sp on sp.organization_id = li.organization_id and sp.id = li.space_id
                           where li.organization_id = $1 and sp.name like 'Volume %')`;

    /**
     * Seeds spaces, lists and grants in an organization, as an import would, as the migrator role.
     *
     * @param organizationId - The organization.
     * @param accounts - The accounts: the first `owners` own the spaces, the others receive the
     * grants of spaces; all of them receive grants of lists.
     * @param shape - How much of each.
     */
    async function seedAccess(
      organizationId: string,
      accounts: readonly string[],
      shape: VolumeShape,
    ): Promise<void> {
      await asSystem(
        `insert into spaces (organization_id, name, prefix, color, visibility, owner_user_id, statuses, created_at)
         select $1, 'Volume ' || n, 'VOL', 'gris',
                case when n % 2 = 0 then 'organization' else 'private' end,
                ($2::uuid[])[(n % $3::int) + 1],
                (select statuses from spaces where organization_id = $5 and id = $6),
                now() - make_interval(secs => ($4::int - n) * 10)
           from generate_series(0, $4::int - 1) as n`,
        [organizationId, accounts, shape.owners, shape.spaces, atelierNordId, produit.id],
      );
      await asSystem(
        `insert into lists (organization_id, space_id, name, color, organization_access, created_at)
         select s.organization_id, s.id, 'Liste ' || k, 'gris', k % 5 <> 4,
                s.created_at + make_interval(secs => k)
           from spaces as s cross join generate_series(0, $2::int - 1) as k
          where s.organization_id = $1 and s.name like 'Volume %'`,
        [organizationId, shape.listsPerSpace],
      );
      await asSystem(
        `insert into space_grants
           (organization_id, space_id, user_id, role, granted_by_type, granted_by_id, created_at, granted_at)
         select s.organization_id, s.id,
                ($2::uuid[])[$3::int + ((s.rank * $4::int + k) % (array_length($2::uuid[], 1) - $3::int))::int + 1],
                (array['edit', 'comment', 'view'])[k % 3 + 1], 'user', s.owner_user_id::text, now(), now()
           from (select organization_id, id, owner_user_id,
                        row_number() over (order by created_at, id) - 1 as rank
                   from spaces where organization_id = $1 and name like 'Volume %') as s
          cross join generate_series(0, $4::int - 1) as k`,
        [organizationId, accounts, shape.owners, shape.spaceGrants],
      );
      await asSystem(
        `insert into list_grants
           (organization_id, list_id, space_id, user_id, role, granted_by_type, granted_by_id, created_at, granted_at)
         select l.organization_id, l.id, l.space_id, l.user_id,
                (array['edit', 'comment', 'view'])[l.k % 3 + 1], 'user', l.owner_user_id::text, now(), now()
           from (select li.organization_id, li.id, li.space_id, sp.owner_user_id, k,
                        ($2::uuid[])[((row_number() over (order by li.created_at, li.id, k) - 1)
                                       % array_length($2::uuid[], 1))::int + 1] as user_id
                   from lists as li
                   join spaces as sp on sp.organization_id = li.organization_id and sp.id = li.space_id
                  cross join generate_series(0, $3::int - 1) as k
                  where li.organization_id = $1 and sp.name like 'Volume %') as l
          where l.user_id <> l.owner_user_id`,
        [organizationId, accounts, shape.listGrants],
      );
    }

    /**
     * Seeds the tasks of the seeded lists of an organization with their assignees, labels and
     * activity, as an import would, as the migrator role: `perList` tasks per list keyed `VOL-n`,
     * every tenth assigned to `member` (the first task of each list, a list of the switch on), the
     * others to one of `others`, one or two labels each, a `create` entry for the first 15,000
     * tasks and 5,000 status changes on the tasks of `activityListId`.
     *
     * @param organizationId - The organization.
     * @param perList - Tasks per list.
     * @param member - The account the statements are planned for.
     * @param others - Other accounts, which never hold `member`.
     * @param activityListId - The list with a long activity.
     */
    async function seedTasks(
      organizationId: string,
      perList: number,
      member: string,
      others: readonly string[],
      activityListId: string,
    ): Promise<void> {
      await asSystem(
        `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status,
                            priority, due_date, completed_at, created_at, created_by_type, created_by_id)
         select l.organization_id, l.space_id, l.id, 'VOL', (l.rank * $2::int + k + 1)::int,
                'Tâche importée ' || (l.rank * $2::int + k + 1),
                case when (l.rank + k) % 10 in (7, 8) then 'done'
                     else (array['todo', 'progress', 'review', 'backlog', 'triage', 'waiting', 'blocked'])[((l.rank + k) % 7)::int + 1]
                end,
                (array['urgente', 'haute', 'moyenne', 'basse'])[((l.rank + k) % 4)::int + 1],
                case when k % 3 = 2 then null else date '2026-11-01' + ((l.rank + k) % 20)::int end,
                case when (l.rank + k) % 10 in (7, 8) then now() end,
                l.created_at + make_interval(secs => k), 'user', l.owner_user_id::text
           from ${seededLists} as l cross join generate_series(0, $2::int - 1) as k`,
        [organizationId, perList],
      );
      await asSystem(
        `insert into task_assignees (organization_id, task_id, user_id, position)
         select t.organization_id, t.id,
                case when t.key_number % $4::int = 1 then $2::uuid
                     else ($3::uuid[])[(t.key_number % array_length($3::uuid[], 1)) + 1] end,
                0
           from tasks as t where t.organization_id = $1 and t.key_prefix = 'VOL'`,
        [organizationId, member, others, perList],
      );
      await asSystem(
        `insert into task_labels (organization_id, task_id, label_key, name, position)
         select t.organization_id, t.id, 'étiquette ' || (t.key_number % 40), 'Étiquette ' || (t.key_number % 40), 0
           from tasks as t where t.organization_id = $1 and t.key_prefix = 'VOL'
         union all
         select t.organization_id, t.id, 'thème ' || (t.key_number % 7), 'Thème ' || (t.key_number % 7), 1
           from tasks as t where t.organization_id = $1 and t.key_prefix = 'VOL' and t.key_number % 2 = 0`,
        [organizationId],
      );
      await asSystem(
        `insert into activity_entries (organization_id, task_id, list_id, kind, actor_type, actor_id, occurred_at)
         select t.organization_id, t.id, t.list_id, 'create', 'user', t.created_by_id, t.created_at
           from tasks as t where t.organization_id = $1 and t.key_prefix = 'VOL' and t.key_number <= 15000`,
        [organizationId],
      );
      await asSystem(
        `insert into activity_entries
           (organization_id, task_id, list_id, kind, actor_type, actor_id, occurred_at, status_from, status_to)
         select t.organization_id, t.id, t.list_id, 'status', 'user', $3, now() - make_interval(secs => n),
                'todo', 'progress'
           from generate_series(1, 5000) as n
           join (select organization_id, id, list_id, row_number() over (order by key_number) - 1 as r
                   from tasks where organization_id = $1 and list_id = $2) as t
             on t.r = n % $4::int`,
        [organizationId, activityListId, member, perList],
      );
    }

    /**
     * Seeds the access requests and the attempts of an organization, as the migrator role: one
     * pending request in four for a space, one in four for a task of a seeded list when tasks were
     * seeded, the others for a list; then answered requests (the history) and attempts of the last
     * hour.
     *
     * @param organizationId - The organization.
     * @param accounts - The requesters.
     * @param shape - How much of each.
     * @param tasksPerList - Tasks per seeded list, 0 when none was seeded.
     */
    async function seedRequests(
      organizationId: string,
      accounts: readonly string[],
      shape: VolumeShape,
      tasksPerList: number,
    ): Promise<void> {
      const listCount = shape.spaces * shape.listsPerSpace;
      await asSystem(
        `insert into access_requests
           (organization_id, target, target_id, space_id, list_id, task_id, task_key, requester_user_id, created_at)
         select l.organization_id,
                case when i % 4 = 0 then 'space' when i % 4 = 1 and t.id is not null then 'task' else 'list' end,
                case when i % 4 = 0 then l.space_id when i % 4 = 1 and t.id is not null then t.id else l.id end,
                l.space_id,
                case when i % 4 = 0 then null else l.id end,
                case when i % 4 = 1 then t.id end,
                case when i % 4 = 1 and t.id is not null then 'VOL-' || t.key_number end,
                ($2::uuid[])[(i % array_length($2::uuid[], 1)) + 1],
                now() - make_interval(secs => i)
           from generate_series(0, $3::int - 1) as i
           join ${seededLists} as l on l.rank = (i * 13) % $4::int
           left join tasks as t
             on t.organization_id = l.organization_id and t.list_id = l.id and t.key_prefix = 'VOL'
            and t.key_number = l.rank * $5::int + (i % greatest($5::int, 1)) + 1
         on conflict (organization_id, requester_user_id, target, target_id) where state = 'pending'
         do nothing`,
        [organizationId, accounts, shape.pending, listCount, tasksPerList],
      );
      await asSystem(
        `insert into access_requests
           (organization_id, target, target_id, space_id, list_id, requester_user_id, state, role,
            created_at, decided_at, decided_by_type, decided_by_id)
         select l.organization_id, 'list', l.id, l.space_id, l.id,
                ($2::uuid[])[(i % array_length($2::uuid[], 1)) + 1],
                case when i % 2 = 0 then 'approved' else 'refused' end,
                case when i % 2 = 0 then 'view' else null end,
                now() - make_interval(days => 2, secs => i), now() - make_interval(days => 1, secs => i),
                'user', l.owner_user_id::text
           from generate_series(0, $3::int - 1) as i
           join ${seededLists} as l on l.rank = (i * 7) % $4::int`,
        [organizationId, accounts, shape.decided, listCount],
      );
      await asSystem(
        `insert into access_request_attempts (organization_id, user_id, attempted_at)
         select $1, ($2::uuid[])[(i % array_length($2::uuid[], 1)) + 1],
                now() - make_interval(secs => (i * 7) % 3500)
           from generate_series(0, $3::int - 1) as i`,
        [organizationId, accounts, shape.attempts],
      );
    }

    /**
     * Runs work of the repositories in a tenant transaction of Atelier Nord as `task_app` (the
     * settings the tenant runner of the kit sets), records every statement they send through the
     * Drizzle logger, takes the plan `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` of the first `keep`
     * of them after a first run that warms the cache, then rolls everything back.
     *
     * @param label - What the work is.
     * @param work - The calls of the repositories, or statements run through `db.execute`.
     * @param keep - How many of the statements to plan, all of them by default.
     * @returns One line per statement planned.
     */
    async function plansOf(
      label: string,
      work: (db: TransactionDatabase) => Promise<unknown>,
      keep = Number.POSITIVE_INFINITY,
    ): Promise<PlanLine[]> {
      const client = await application.connect();
      const captured: CapturedStatement[] = [];
      try {
        await client.query('begin');
        await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
          'app.organization_id',
          atelierNordId,
          'app.system_access',
          'off',
        ]);
        const db = drizzle({
          client,
          logger: {
            logQuery: (query: string, params: unknown[]): void => {
              captured.push({ sql: query, params });
            },
          },
        });
        await work(db);
        const planned = captured.slice(0, keep);
        const lines: PlanLine[] = [];
        for (const [index, statement] of planned.entries()) {
          const text = `explain (analyze, buffers, format json) ${statement.sql}`;
          await client.query(text, statement.params);
          const result = await client.query<{ readonly 'QUERY PLAN': readonly PlanDocument[] }>(
            text,
            statement.params,
          );
          const document = result.rows[0]?.['QUERY PLAN'][0];
          if (document === undefined) {
            throw new Error(`No plan for ${label}.`);
          }
          lines.push(
            summarize(captured.length === 1 ? label : `${label} (${String(index + 1)})`, document),
          );
        }
        return lines;
      } finally {
        await client.query('rollback');
        client.release();
      }
    }

    /**
     * Prints one compact line per plan, for the report of the pull request.
     *
     * @param plans - The plans.
     */
    function print(plans: readonly PlanLine[]): void {
      for (const plan of plans) {
        console.info(
          `access plan | ${plan.label} | ${plan.nodes.join(' > ')} | indexes ${plan.indexes.join(', ') || 'none'} | ${String(plan.blocks)} shared buffers | ${plan.milliseconds.toFixed(3)} ms | ${String(plan.rows)} rows`,
        );
      }
    }

    /**
     * The sequential scans of some tables in some plans.
     *
     * @param plans - The plans.
     * @param tables - The tables.
     * @returns `<label>: <table>` for each scan.
     */
    function seqScansOf(plans: readonly PlanLine[], tables: readonly string[]): string[] {
      return plans.flatMap((plan) =>
        plan.seqScans
          .filter((table) => tables.includes(table))
          .map((table) => `${plan.label}: ${table}`),
      );
    }

    // A member who owns no space, holds about 30 grants of spaces and 60 grants of lists, asks,
    // and is assigned to 3,000 tasks.
    const accounts = Array.from({ length: 500 }, () => randomUUID());
    const viewer = accounts[301] ?? '';
    const member = { userId: viewer, role: 'member' } as const;
    const guest = { userId: accounts[302] ?? '', role: 'guest' } as const;
    const tasksPerList = 10;
    let visibleListIds: readonly string[] = [];
    let activityListId = '';

    it('seeds a realistic organization and its noise in the second organization', async () => {
      const atelierNord: VolumeShape = {
        owners: 300,
        spaces: 300,
        listsPerSpace: 10,
        spaceGrants: 20,
        listGrants: 10,
        pending: 2_000,
        decided: 8_000,
        attempts: 5_000,
      };
      const delta: VolumeShape = {
        owners: 100,
        spaces: 100,
        listsPerSpace: 10,
        spaceGrants: 20,
        listGrants: 10,
        pending: 1_000,
        decided: 2_000,
        attempts: 2_000,
      };
      const noise = Array.from({ length: 200 }, () => randomUUID());
      await seedAccess(atelierNordId, accounts, atelierNord);
      await seedAccess(atelierDeltaId, noise, delta);
      // The first list of the first space of the whole organization: on, seen by every member.
      const [first] = await asSystem<{ readonly id: string }>(
        `select l.id::text as id from ${seededLists} as l where l.rank = 0`,
        [atelierNordId],
      );
      activityListId = first?.id ?? '';
      await seedTasks(
        atelierNordId,
        tasksPerList,
        viewer,
        accounts.filter((account) => account !== viewer),
        activityListId,
      );
      await seedRequests(atelierNordId, accounts, atelierNord, tasksPerList);
      await seedRequests(atelierDeltaId, noise, delta, 0);
      await migrator.query(
        `analyze spaces, lists, space_grants, list_grants, access_requests, access_request_attempts,
                 tasks, task_assignees, task_labels, activity_entries`,
      );
      const volume = await asSystem<Record<string, number>>(
        `select
           (select count(*)::int from spaces where organization_id = $1) as spaces,
           (select count(*)::int from lists where organization_id = $1) as lists,
           (select count(*)::int from space_grants where organization_id = $1) as "spaceGrants",
           (select count(*)::int from list_grants where organization_id = $1) as "listGrants",
           (select count(distinct user_id)::int from (select user_id from space_grants where organization_id = $1
              union all select user_id from list_grants where organization_id = $1) as g) as accounts,
           (select count(*)::int from access_requests where organization_id = $1 and state = 'pending') as pending,
           (select count(*)::int from access_requests where organization_id = $1 and state = 'pending' and target = 'task') as "pendingTasks",
           (select count(*)::int from access_requests where organization_id = $1) as requests,
           (select count(*)::int from access_request_attempts where organization_id = $1) as attempts,
           (select count(*)::int from tasks where organization_id = $1 and key_prefix = 'VOL') as tasks,
           (select count(*)::int from task_assignees where organization_id = $1) as assignments,
           (select count(*)::int from task_assignees where organization_id = $1 and user_id = $3) as "assignedToMember",
           (select count(*)::int from task_labels where organization_id = $1) as labels,
           (select count(*)::int from activity_entries where organization_id = $1) as activity,
           (select count(*)::int from list_grants where organization_id = $2) as "noiseListGrants",
           (select count(*)::int from access_requests where organization_id = $2) as "noiseRequests"`,
        [atelierNordId, atelierDeltaId, viewer],
      );
      console.info(`access plans volume: ${JSON.stringify(volume[0])}`);
      expect(volume[0]).toMatchObject({ tasks: 30_000, assignedToMember: 3_000 });
      const visible: ListVisibleListIdsOutput = await runWithOrganizationContext(
        contextOf(atelierNordId),
        () =>
          service()
            .get(ListVisibleListIds)
            .execute({ organizationId: atelierNordId, viewerUserId: viewer, viewerRole: 'member' }),
      );
      visibleListIds = visible.listIds;
      console.info(`access plans: the member has a role on ${String(visibleListIds.length)} lists`);
      expect(visibleListIds.length).toBeGreaterThan(1_000);
      expect(visibleListIds).toContain(activityListId);
    }, 300_000);

    it('reads the visible lists and spaces, the grants, the managed targets, the pending requests, the attempts and the clean-up batches without a Seq Scan of the four tables', async () => {
      const [held] = await asSystem<{ readonly space_id: string; readonly list_id: string }>(
        `select g.space_id::text as space_id, l.id::text as list_id
           from space_grants as g join lists as l on l.organization_id = g.organization_id and l.space_id = g.space_id
          where g.organization_id = $1 and g.user_id = $2
          order by g.space_id, l.id limit 1`,
        [atelierNordId, viewer],
      );
      const spaceId = held?.space_id ?? '';
      const listId = held?.list_id ?? '';
      const managed: ListManagedAccessTargetsOutput = await runWithOrganizationContext(
        contextOf(atelierNordId),
        () =>
          service()
            .get(ListManagedAccessTargets)
            .execute({ organizationId: atelierNordId, viewerUserId: viewer, viewerRole: 'member' }),
      );
      expect(managed.listIds.length).toBeGreaterThan(100);
      // The task requests the member answers: those whose task is now in a list they edit, as the
      // listing finds them.
      const answerable = await asSystem<{ readonly task_id: string }>(
        `select distinct r.task_id::text as task_id
           from access_requests as r
           join tasks as t on t.organization_id = r.organization_id and t.id = r.task_id
          where r.organization_id = $1 and r.state = 'pending' and r.target = 'task'
            and t.list_id = any($2::uuid[])`,
        [atelierNordId, managed.listIds],
      );
      const taskIds = answerable.map((row) => row.task_id);
      expect(taskIds.length).toBeGreaterThan(0);
      const scope = {
        spaceIds: managed.spaceIds,
        listIds: managed.listIds,
        taskIds,
        spaceId: null,
        listId: null,
      } as const;
      let resources: readonly GrantedResource[] = [];
      const batch = await plansOf('clean-up: grants of the account', async (db) => {
        resources = await new DrizzleGrantRepository(db).listOfMember(atelierNordId, viewer, 100);
      });
      const batchSpaceIds = [...new Set(resources.map((resource) => resource.spaceId))];
      const batchListIds = resources
        .flatMap((resource) => (resource.kind === 'list' ? [resource.listId] : []))
        .sort();
      expect(batchSpaceIds.length).toBeGreaterThan(0);
      expect(batchListIds.length).toBeGreaterThan(0);

      const plans: PlanLine[] = [
        ...(await plansOf('visible lists of a member (ListVisibleListIds)', (db) =>
          new DrizzleTaskListRepository(db).listAccessesVisibleTo(atelierNordId, member),
        )),
        ...(await plansOf('visible lists of a guest (ListVisibleListIds)', (db) =>
          new DrizzleTaskListRepository(db).listAccessesVisibleTo(atelierNordId, guest),
        )),
        ...(await plansOf('first lists of the sidebar of a member ("Accueil")', (db) =>
          new DrizzleTaskListRepository(db).listFirstVisibleTo(atelierNordId, member, 6),
        )),
        ...(await plansOf('page of visible spaces of a member', (db) =>
          new DrizzleSpaceRepository(db).listVisible(atelierNordId, member, null, 51),
        )),
        ...(await plansOf('page of visible spaces of a guest', (db) =>
          new DrizzleSpaceRepository(db).listVisible(atelierNordId, guest, null, 51),
        )),
        ...(await plansOf('lists of a space for a viewer', (db) =>
          new DrizzleTaskListRepository(db).listOfSpaceVisibleTo(
            atelierNordId,
            spaceId,
            member,
            null,
            51,
          ),
        )),
        ...(await plansOf('grant lookup of one viewer on one space and one list', (db) =>
          new DrizzleGrantRepository(db).viewerGrants(atelierNordId, viewer, spaceId, listId),
        )),
        ...(await plansOf('grant lookup of one viewer on one space', (db) =>
          new DrizzleGrantRepository(db).viewerGrants(atelierNordId, viewer, spaceId, null),
        )),
        ...(await plansOf('grants of a space', (db) =>
          new DrizzleGrantRepository(db).listOf(atelierNordId, { kind: 'space', spaceId }),
        )),
        ...(await plansOf('grants of a list', (db) =>
          new DrizzleGrantRepository(db).listOf(atelierNordId, { kind: 'list', spaceId, listId }),
        )),
        ...(await plansOf('managed targets: spaces seen', (db) =>
          new DrizzleSpaceRepository(db).listAllVisible(atelierNordId, member),
        )),
        ...(await plansOf('pending task requests of the organization (the listing)', (db) =>
          new DrizzleAccessRequestRepository(db).listPendingTaskIds(atelierNordId),
        )),
        ...(await plansOf('page of pending access requests', (db) =>
          new DrizzleAccessRequestRepository(db).listPending(atelierNordId, scope, null, 51),
        )),
        ...(await plansOf('total of pending access requests', (db) =>
          new DrizzleAccessRequestRepository(db).countPending(atelierNordId, scope),
        )),
        ...(await plansOf('page of pending access requests of one space', (db) =>
          new DrizzleAccessRequestRepository(db).listPending(
            atelierNordId,
            { ...scope, spaceId },
            null,
            51,
          ),
        )),
        ...(await plansOf('attempts of the hour (the count)', (db) =>
          new DrizzleRequestAttemptRepository(db).recent(
            atelierNordId,
            viewer,
            new Date(Date.now() - 3_600_000),
            10,
          ),
        )),
        ...batch,
        // The order of the spaces of the batch, then the lock of the first of them: one row each.
        ...(await plansOf(
          'clean-up: spaces of the batch locked',
          (db) =>
            new DrizzleSpaceRepository(db).lockInOrder(
              atelierNordId,
              batchSpaceIds.map((id) => ({ id, mode: 'update' as const })),
            ),
          2,
        )),
        ...(await plansOf('clean-up: lists of the batch locked', (db) =>
          new DrizzleTaskListRepository(db).lockMany(atelierNordId, batchListIds),
        )),
        ...(await plansOf('clean-up: requests of the account locked, pending or answered', (db) =>
          new DrizzleAccessRequestRepository(db).lockRequestsOf(atelierNordId, viewer, 500),
        )),
      ];

      print(plans);
      expect(plans.length).toBeGreaterThanOrEqual(21);
      expect(seqScansOf(plans, accessTables)).toEqual([]);
      const requesterLock = plans.at(-1);
      expect(requesterLock?.indexes).toContain('access_requests_requester_index');
    }, 300_000);

    // The cross-list reads filter `tasks.list_id = ANY($listIds)` with every list the member has a
    // role on, here about 1,400. The statements that start from the assignments of the member
    // (3,000 rows) or from one list must not scan the table they start from: `task_assignees` by
    // `task_assignees_user_index`, `activity_entries` by `activity_entries_list_index`, and the page
    // of the activity reaches its 51 tasks by `tasks_pkey`. Where the planner joins a whole side by
    // hash, it scans `tasks` (30,000 rows, about 1,000 blocks) rather than probing its key thousands
    // of times: the 3,000 assignments of "Mes tâches" and "Accueil", and the 5,005 entries of the
    // total of the activity of the list. The labels read every label row of the visible tasks. Those
    // scans are printed for the report, not asserted.
    it('reads the labels, "Mes tâches", "Accueil" and the activity of a list with the real list ids of a member', async () => {
      expect(visibleListIds.length).toBeGreaterThan(1_000);
      const plans: PlanLine[] = [
        ...(await plansOf('labels page of a member (labelPageStatement)', (db) =>
          db.execute(labelPageStatement(atelierNordId, visibleListIds, null, null, 51)),
        )),
        ...(await plansOf('"Mes tâches" page (assignedPageStatement)', (db) =>
          db.execute(
            assignedPageStatement(atelierNordId, viewer, visibleListIds, 'open', null, 51),
          ),
        )),
        ...(await plansOf('"Mes tâches" counts (stateCountsStatement)', (db) =>
          db.execute(stateCountsStatement(atelierNordId, viewer, visibleListIds)),
        )),
        ...(await plansOf('"Accueil" stats (homeStatsStatement)', (db) =>
          db.execute(homeStatsStatement(atelierNordId, viewer, visibleListIds, today)),
        )),
        ...(await plansOf('activity of a list: page', (db) =>
          new DrizzleActivityRepository(db).pageOfList(
            atelierNordId,
            { listId: activityListId, listIds: visibleListIds, kinds: null, actorIds: null },
            null,
            51,
          ),
        )),
        ...(await plansOf('activity of a list: total', (db) =>
          new DrizzleActivityRepository(db).countOfList(atelierNordId, {
            listId: activityListId,
            listIds: visibleListIds,
            kinds: null,
            actorIds: null,
          }),
        )),
      ];

      print(plans);
      expect(plans).toHaveLength(6);
      expect(plans.map((plan) => plan.rows)).toEqual([49, 51, 1, 1, 51, 1]);
      const assigned = plans.filter((plan) => plan.label.includes('"'));
      expect(seqScansOf(assigned, ['task_assignees'])).toEqual([]);
      const activity = plans.filter((plan) => plan.label.startsWith('activity'));
      expect(seqScansOf(activity, ['activity_entries'])).toEqual([]);
      expect(seqScansOf(activity.slice(0, 1), ['tasks'])).toEqual([]);
      console.info(
        `access plans: sequential scans of the task tables: ${seqScansOf(plans, taskTables).join('; ') || 'none'}`,
      );
    }, 300_000);
  });
});
