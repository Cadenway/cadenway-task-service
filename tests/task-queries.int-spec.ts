import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { PRIORITY_KEYS, STATUS_KEYS } from '@cadenway/contracts';
import type { PriorityKey, StatusKey } from '@cadenway/contracts';
import type { MemberJoinedV1 } from '@cadenway/contracts/events/organization-service';
import {
  CountTaskGroupsInternalResponse,
  CreateListInternalResponse,
  CreateSpaceInternalResponse,
  CreateSubtaskInternalResponse,
  CreateTaskInternalResponse,
  GetHomeInternalResponse,
  GetListCountsInternalResponse,
  GetSpaceOverviewInternalResponse,
  ListLabelsInternalResponse,
  ListMyTasksInternalResponse,
  ListTasksInternalResponse,
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
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';
import type { TaskFilter } from '../src/modules/tasks/application/models/query/task-filter.model.js';
import type { TaskGrouping } from '../src/modules/tasks/application/models/query/task-grouping.model.js';
import type { TaskOrder } from '../src/modules/tasks/application/models/query/task-order.model.js';
import type { TaskPosition } from '../src/modules/tasks/application/models/query/task-position.model.js';
import { assignedPageStatement } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/assignee/assigned-task-statements.mapper.js';
import {
  countsOfListsStatement,
  homeStatsStatement,
  stateCountsStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/count/task-counts.mapper.js';
import { labelPageStatement } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/label/label-statements.mapper.js';
import {
  countStatement,
  groupStatement,
  pageStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/query/task-query-statements.mapper.js';

// The seven queries of the tasks module, on a disposable PostgreSQL and NATS: the service as
// main.ts assembles it (the `task_app` role, the `task` NATS user), started from compose.dev.yaml as
// a throwaway Compose project on free ports, as tasks.int-spec.ts does. The members come from the
// copy of the memberships, fed the way organization-service feeds it (member events published to
// `EVENTS` with the `admin` user of the `nats-streams` container). The routes are called with
// internal tokens signed as the API gateway and every answer is checked against the validator
// generated from `openapi/internal/task-service.yaml`: it must parse and the parse must drop
// nothing. Rows are aged and seeded as the migrator role, which sets the system access of the
// policies, since row-level security is forced on every table.
//
// The semantic scenarios work on a fixture created through the routes in the "Backlog produit" list
// of Atelier Nord and are checked against a reference model written in this file, which computes
// every filter, sort, group and counter in plain TypeScript from the fixture. The "Sprint 14" list
// of the mockup is seeded by SQL with its 98 tasks. The measurement at the end seeds a large list
// by SQL and takes `EXPLAIN (ANALYZE, BUFFERS)` plans of the statements of the routes as `task_app`.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-queries-test-${String(process.pid)}`;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** A second organization, with its own owner, which must never meet a row of Atelier Nord. */
const atelierDeltaId = '01938f6e-0000-7000-8000-000000000002';

/** The date of the caller in the scenarios: the one of the examples of the contract. */
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

/** Hugo Dubois (HD), member of Atelier Nord, owner of a private space. */
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

/** Mathis Roux, member of Atelier Nord, assigned to tasks of Sprint 14. */
const mathis: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2a',
  memberId: '01938f6e-9000-7000-8000-0000000000c8',
};

/** Chloé Girard, member of Atelier Nord, assigned to tasks of Sprint 14. */
const chloe: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2d',
  memberId: '01938f6e-9000-7000-8000-0000000000cc',
};

/** Théo Garnier, member of Atelier Nord, assigned to more tasks than "Accueil" shows. */
const theo: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2f',
  memberId: '01938f6e-9000-7000-8000-0000000000ce',
};

/** An account the copy of the memberships does not hold. */
const stranger: Person = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9cff',
  memberId: '01938f6e-9000-7000-8000-0000000000ff',
};

/** The labels of the mockup (`openapi/public/tasks.yaml:1362-1372`), by key and by name. */
const mockupLabels: readonly (readonly [string, string])[] = [
  ['auth', 'Auth'],
  ['back', 'Back'],
  ['bug', 'Bug'],
  ['contenu', 'Contenu'],
  ['design', 'Design'],
  ['docs', 'Docs'],
  ['facturation', 'Facturation'],
  ['front', 'Front'],
  ['recherche', 'Recherche'],
  ['sécurité', 'Sécurité'],
];

/** HTTP verbs the spec uses. */
type HttpMethod = 'get' | 'post' | 'patch';

/** What a call adds to its path. */
interface SendOptions {
  readonly organizationId?: string;
  readonly body?: object;
}

/** A query string, by parameter; an undefined value leaves the parameter out. */
type Query = Readonly<Record<string, string | number | undefined>>;

/** A page of tasks, as the route answers it. */
type TaskPageBody = z.output<typeof ListTasksInternalResponse>;

/** A page of groups, as the route answers it. */
type GroupPageBody = z.output<typeof CountTaskGroupsInternalResponse>;

/** The counts of a list, as the route answers them. */
type ListCountsBody = z.output<typeof GetListCountsInternalResponse>;

/** The overview of a space, as the route answers it. */
type OverviewBody = z.output<typeof GetSpaceOverviewInternalResponse>;

/** A page of labels, as the route answers it. */
type LabelPageBody = z.output<typeof ListLabelsInternalResponse>;

/** A page of "Mes tâches", as the route answers it. */
type MyTaskPageBody = z.output<typeof ListMyTasksInternalResponse>;

/** "Accueil", as the route answers it. */
type HomeBody = z.output<typeof GetHomeInternalResponse>;

/** A list or a sprint, as the routes answer it. */
type ListBody = z.output<typeof CreateListInternalResponse>;

/** A space, as the routes answer it. */
type SpaceBody = z.output<typeof CreateSpaceInternalResponse>['space'];

/** The counters of a list. */
interface Counts {
  readonly total: number;
  readonly open: number;
  readonly done: number;
  readonly cancelled: number;
  readonly late: number;
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
 * Publishes `member.joined.v1` on its subject with the `admin` user, as organization-service does.
 *
 * @param organizationId - Organization of the membership.
 * @param person - The membership and its account.
 * @param role - Role of the membership.
 */
function publishJoined(organizationId: string, person: Person, role: MemberJoinedV1['role']): void {
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
 * @param body - What the route returned.
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
 * Builds the query string of a call; the commas that separate values stay readable.
 *
 * @param params - The parameters; an undefined value is left out.
 * @returns The query string with its `?`, empty without parameters.
 */
function queryOf(params: Query): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value)).replace(/%2C/gu, ',')}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/**
 * The median of some durations.
 *
 * @param durations - The durations, in milliseconds.
 * @returns The middle one.
 */
function median(durations: readonly number[]): number {
  const sorted = [...durations].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Rounds a duration for the report.
 *
 * @param milliseconds - The duration.
 * @returns The duration with one decimal.
 */
function rounded(milliseconds: number): number {
  return Math.round(milliseconds * 10) / 10;
}

// #region Reference model

/** A task of the fixture, as the scenarios create it. */
interface Seed {
  readonly name: string;
  readonly status: StatusKey;
  readonly priority: PriorityKey;
  readonly assignees: readonly Person[];
  readonly due: string | null;
  readonly labels: readonly string[];
  /** The list the task is created in; a subtask lives in the list of its parent. */
  readonly list: 'backlog' | 'recherche' | 'direction' | 'marketing';
  /** The index in the seeds of the parent, for a subtask. */
  readonly parent?: number;
  /** Why the task is cancelled. */
  readonly cancel?: 'duplicate' | 'wontdo';
}

/** A seed once created: its key, and the position in the order of creation. */
interface Row extends Seed {
  readonly index: number;
  readonly key: string;
}

/** The people who see a space of the fixture. */
const seenByEveryone: readonly string[] = [
  camille.userId,
  ines.userId,
  hugo.userId,
  lea.userId,
  theo.userId,
  mathis.userId,
  chloe.userId,
];

/**
 * Who sees the tasks of a list of the fixture: everyone, except for the private spaces of Hugo
 * (Recherche) and of Camille (Direction), which only their owner sees.
 *
 * @param list - The list of the task.
 * @param person - The viewer.
 * @returns Whether the viewer sees the tasks of the list.
 */
function sees(list: Seed['list'], person: Person): boolean {
  switch (list) {
    case 'recherche':
      return person.userId === hugo.userId;
    case 'direction':
      return person.userId === camille.userId;
    case 'backlog':
    case 'marketing':
      return seenByEveryone.includes(person.userId);
  }
}

/**
 * The letters the fold of the SQL replaces after `casefold`, which NFKD leaves whole: `replace` for
 * the ligatures and the sharp s, `translate` for the stroked letters.
 */
const PLAIN_LETTERS: Readonly<Record<string, string>> = {
  ß: 'ss',
  œ: 'oe',
  æ: 'ae',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  ħ: 'h',
  ŧ: 't',
  ı: 'i',
};

/**
 * The text compared "without regard to case or accents" (`openapi/public/tasks.yaml:225-226`): the
 * reference of the fold the SQL computes with `casefold`, the plain letters of `PLAIN_LETTERS`,
 * `normalize(NFKD)` and the removal of the combining marks.
 *
 * @param text - Any text.
 * @returns The folded text.
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ßœæøłđðħŧı]/gu, (letter) => PLAIN_LETTERS[letter] ?? letter)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '');
}

/**
 * Compares two texts by code point, as the `C` collation does.
 *
 * @param left - First text.
 * @param right - Second text.
 * @returns A negative number, zero or a positive number.
 */
function byCodePoint(left: string, right: string): number {
  const first = Array.from(left);
  const second = Array.from(right);
  for (let position = 0; position < Math.min(first.length, second.length); position += 1) {
    const difference =
      (first[position]?.codePointAt(0) ?? 0) - (second[position]?.codePointAt(0) ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return first.length - second.length;
}

/**
 * Whether a status is closed: the categories `done` and `cancelled` of the contract.
 *
 * @param status - The status.
 * @returns Whether the task is closed.
 */
function isClosed(status: StatusKey): boolean {
  return status === 'done' || status === 'cancelled';
}

/**
 * The order of a sort for the reference model: the list order breaks every tie, and a reversed key
 * keeps the ties in ascending list order, as the contract says (`openapi/public/tasks.yaml:233`),
 * except for `-manual` and `-createdAt`, which reverse everything. A task without a due date is
 * last in both directions.
 *
 * @param sort - A value of the `sort` parameter.
 * @returns The comparator of the rows.
 */
function comparatorOf(sort: string): (left: Row, right: Row) => number {
  const descending = sort.startsWith('-');
  const key = descending ? sort.slice(1) : sort;
  const byIndex = (left: Row, right: Row): number => left.index - right.index;
  switch (key) {
    case 'dueDate':
      return (left, right) => {
        if (left.due === right.due) {
          return byIndex(left, right);
        }
        if (left.due === null) {
          return 1;
        }
        if (right.due === null) {
          return -1;
        }
        return (descending ? -1 : 1) * byCodePoint(left.due, right.due);
      };
    case 'priority':
      return (left, right) =>
        (descending ? -1 : 1) *
          (PRIORITY_KEYS.indexOf(left.priority) - PRIORITY_KEYS.indexOf(right.priority)) ||
        byIndex(left, right);
    case 'name':
      return (left, right) =>
        (descending ? -1 : 1) * byCodePoint(fold(left.name), fold(right.name)) ||
        byIndex(left, right);
    default:
      return (left, right) => (descending ? -1 : 1) * byIndex(left, right);
  }
}

/**
 * The order of "Mes tâches" and "Accueil": by due date with the undated last, then in the order of
 * creation.
 *
 * @param left - A row.
 * @param right - Another row.
 * @returns A negative number, zero or a positive number.
 */
function byDueThenCreation(left: Row, right: Row): number {
  return comparatorOf('dueDate')(left, right);
}

// #endregion

/**
 * The fixture of the scenarios, in the order of creation: twenty tasks of "Backlog produit" built to
 * exercise every filter, tie, accent, case, `none`, `me` and subtask, the subtasks of three of them,
 * the tasks of the private spaces of Hugo and Camille, which the others must never see, and three
 * tasks of Marketing. The first task is CAD-482, the task of the mockup.
 */
const seeds: readonly Seed[] = [
  {
    name: 'Refondre l’écran de connexion SSO',
    status: 'progress',
    priority: 'haute',
    assignees: [camille, hugo],
    due: '2026-11-13',
    labels: ['Design', 'Auth'],
    list: 'backlog',
  },
  {
    name: 'Page des quotas d’organisation',
    status: 'todo',
    priority: 'moyenne',
    assignees: [hugo, theo],
    due: '2026-11-10',
    labels: ['Front'],
    list: 'backlog',
  },
  {
    name: 'Écran des événements à venir',
    status: 'review',
    priority: 'basse',
    assignees: [lea, theo],
    due: '2026-11-08',
    labels: ['Front', 'Design'],
    list: 'backlog',
  },
  {
    name: 'Corriger le bug du calendrier',
    status: 'blocked',
    priority: 'urgente',
    assignees: [],
    due: '2026-11-06',
    labels: ['Bug'],
    list: 'backlog',
  },
  {
    name: 'élaborer le cahier des charges',
    status: 'backlog',
    priority: 'basse',
    assignees: [],
    due: null,
    labels: ['Recherche'],
    list: 'backlog',
  },
  {
    name: 'Mise à jour de la facturation',
    status: 'testing',
    priority: 'haute',
    assignees: [camille, theo],
    due: '2026-11-20',
    labels: ['Facturation', 'auth'],
    list: 'backlog',
  },
  {
    name: 'Exporter les tâches en CSV',
    status: 'done',
    priority: 'moyenne',
    assignees: [hugo],
    due: '2026-11-04',
    labels: ['Back'],
    list: 'backlog',
  },
  {
    name: 'Intégrer le SSO du fournisseur',
    status: 'cancelled',
    priority: 'moyenne',
    assignees: [lea],
    due: '2026-11-07',
    labels: ['Auth'],
    list: 'backlog',
    cancel: 'duplicate',
  },
  {
    name: 'Notifications par courriel',
    status: 'triage',
    priority: 'moyenne',
    assignees: [theo],
    due: '2026-11-09',
    labels: ['Back', 'Contenu'],
    list: 'backlog',
  },
  {
    name: 'Documentation de l’API',
    status: 'waiting',
    priority: 'basse',
    assignees: [camille, lea],
    due: '2026-11-30',
    labels: ['Docs'],
    list: 'backlog',
  },
  {
    name: 'Sécurité des sessions',
    status: 'progress',
    priority: 'urgente',
    assignees: [theo, hugo],
    due: '2026-11-08',
    labels: ['Sécurité', 'Auth'],
    list: 'backlog',
  },
  {
    name: 'Revue de code',
    status: 'todo',
    priority: 'moyenne',
    assignees: [theo],
    due: null,
    labels: ['Bug'],
    list: 'backlog',
  },
  {
    name: 'revue de code',
    status: 'todo',
    priority: 'moyenne',
    assignees: [],
    due: null,
    labels: [],
    list: 'backlog',
  },
  {
    name: 'Zèbre du tableau de bord',
    status: 'progress',
    priority: 'haute',
    assignees: [theo],
    due: '2026-11-13',
    labels: ['Front'],
    list: 'backlog',
  },
  {
    name: 'API publique v2',
    status: 'todo',
    priority: 'basse',
    assignees: [camille],
    due: '2026-11-09',
    labels: ['Back'],
    list: 'backlog',
  },
  {
    name: 'Ajouter la connexion par lien magique',
    status: 'todo',
    priority: 'haute',
    assignees: [],
    due: null,
    labels: ['Auth'],
    list: 'backlog',
  },
  {
    name: 'Étude de la facturation SSO',
    status: 'done',
    priority: 'basse',
    assignees: [theo],
    due: '2026-11-03',
    labels: ['Facturation'],
    list: 'backlog',
  },
  {
    name: 'Rédiger la newsletter',
    status: 'cancelled',
    priority: 'basse',
    assignees: [hugo],
    due: null,
    labels: ['Contenu'],
    list: 'backlog',
    cancel: 'wontdo',
  },
  {
    name: 'Préparer la démo',
    status: 'review',
    priority: 'urgente',
    assignees: [camille, theo],
    due: '2026-11-12',
    labels: ['Design'],
    list: 'backlog',
  },
  {
    name: 'Tâche 100 % couverte_x',
    status: 'todo',
    priority: 'moyenne',
    assignees: [],
    due: '2026-11-30',
    labels: [],
    list: 'backlog',
  },
  // The subtasks of "Refondre l’écran de connexion SSO", of "Préparer la démo" and of "Zèbre du
  // tableau de bord".
  {
    name: 'Maquette validée',
    status: 'done',
    priority: 'moyenne',
    assignees: [theo],
    due: '2026-11-05',
    labels: ['Design'],
    list: 'backlog',
    parent: 0,
  },
  {
    name: 'Revue sécurité',
    status: 'todo',
    priority: 'haute',
    assignees: [hugo],
    due: '2026-11-06',
    labels: ['Auth'],
    list: 'backlog',
    parent: 0,
  },
  {
    name: 'Jeu de données',
    status: 'progress',
    priority: 'moyenne',
    assignees: [theo],
    due: '2026-11-08',
    labels: ['Design'],
    list: 'backlog',
    parent: 18,
  },
  {
    name: 'Script',
    status: 'todo',
    priority: 'basse',
    assignees: [],
    due: null,
    labels: [],
    list: 'backlog',
    parent: 18,
  },
  {
    name: 'Axe des ordonnées',
    status: 'blocked',
    priority: 'moyenne',
    assignees: [theo],
    due: '2026-11-07',
    labels: [],
    list: 'backlog',
    parent: 13,
  },
  // The private spaces: Théo is assigned in the space of Hugo, who alone sees it.
  {
    name: 'Carnet de recherche',
    status: 'progress',
    priority: 'urgente',
    assignees: [theo, hugo],
    due: '2026-11-07',
    labels: ['AUTH', 'Confidentiel'],
    list: 'recherche',
  },
  {
    name: 'Budget 2027',
    status: 'todo',
    priority: 'haute',
    assignees: [camille],
    due: '2026-11-09',
    labels: ['Budget'],
    list: 'direction',
  },
  // Marketing: one task is late, one is done.
  {
    name: 'Planifier l’envoi',
    status: 'todo',
    priority: 'moyenne',
    assignees: [],
    due: '2026-11-12',
    labels: [],
    list: 'marketing',
  },
  {
    name: 'Rédiger le communiqué',
    status: 'done',
    priority: 'moyenne',
    assignees: [],
    due: '2026-11-02',
    labels: [],
    list: 'marketing',
  },
  {
    name: 'Préparer le lancement',
    status: 'progress',
    priority: 'haute',
    assignees: [],
    due: '2026-11-02',
    labels: [],
    list: 'marketing',
  },
];

/** The sprints of the scenarios, in the order of creation, with the space they belong to. */
interface Sprint {
  readonly name: string;
  readonly start: string;
  readonly end: string;
  readonly space: string;
}

/**
 * The sprints created for "Accueil": Sprint 14 of the mockup, Sprint 15 of Marketing, and a space
 * of its own with twelve current sprints, one that ended and one that has not started. Sprint 14
 * and "Sprint 17 nov." end the same day: the one created first comes first.
 */
const sprints: readonly Sprint[] = [
  { name: 'Sprint 14', start: '2026-11-03', end: '2026-11-17', space: 'Produit' },
  { name: 'Sprint 15', start: '2026-11-08', end: '2026-11-22', space: 'Marketing' },
  { name: 'Sprint 12', start: '2026-10-26', end: '2026-11-07', space: 'Sprints' },
  { name: 'Sprint 16', start: '2026-11-09', end: '2026-11-20', space: 'Sprints' },
  { name: 'Sprint du jour', start: '2026-11-08', end: '2026-11-08', space: 'Sprints' },
  ...Array.from({ length: 11 }, (_, index): Sprint => ({
    name: `Sprint ${String(9 + index)} nov.`,
    start: '2026-11-01',
    end: `2026-11-${String(9 + index).padStart(2, '0')}`,
    space: 'Sprints',
  })),
];

/** The accounts the "Sprint 14" seed assigns, in turn. */
const sprint14Assignees: readonly Person[] = [ines, mathis, chloe];

describe('task queries', () => {
  const gateway = keyPair();
  let app: NestExpressApplication | undefined;
  let signer: InternalTokenSigner;
  let migrator: pg.Pool;
  let telemetry: TelemetryHandle | undefined;

  // The spaces and lists of Atelier Nord the scenarios work in.
  let produit: SpaceBody;
  let produitFirstList: ListBody;
  let backlog: ListBody;
  let sprint14: ListBody;
  let marketing: SpaceBody;
  let marketingFirstList: ListBody;
  let recherche: SpaceBody;
  let rechercheList: ListBody;
  let directionList: ListBody;
  let sprintsSpace: SpaceBody;
  let sprintsFirstList: ListBody;
  /** The lists of the sprints, by name. */
  const sprintLists = new Map<string, ListBody>();
  /** The first key number of the "Sprint 14" seed. */
  let sprint14Base = 0;
  /** The fixture once created. */
  let rows: readonly Row[] = [];

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
   * @param options - Organization (Atelier Nord by default) and body.
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
    if (options.body !== undefined) {
      call = call.send(options.body);
    }
    const response = await call;
    return response;
  }

  /**
   * Reads a route and checks the answer against its validator.
   *
   * @param schema - Validator of the response.
   * @param path - Path of the route, without its query.
   * @param actor - The account the gateway acts for.
   * @param query - The query parameters.
   * @param options - Organization (Atelier Nord by default).
   * @returns The parsed body.
   */
  async function read<TSchema extends z.ZodType>(
    schema: TSchema,
    path: string,
    actor: { readonly userId: string },
    query: Query = {},
    options: SendOptions = {},
  ): Promise<z.output<TSchema>> {
    const response = await send('get', `${path}${queryOf(query)}`, actor, options);
    expectStatus(response, 200);
    return conforms(schema, bodyOf(response));
  }

  /**
   * Reads a route that must refuse with a problem.
   *
   * @param path - Path of the route, without its query.
   * @param actor - The account the gateway acts for.
   * @param query - The query parameters.
   * @param options - Organization (Atelier Nord by default).
   * @returns The response.
   */
  async function refused(
    path: string,
    actor: { readonly userId: string },
    query: Query = {},
    options: SendOptions = {},
  ): Promise<request.Response> {
    return send('get', `${path}${queryOf(query)}`, actor, options);
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
   * Reads the ids of the lists of some spaces, as the migrator role: the cross-list statements
   * filter by the lists the actor has a role on (P3b-1), which, without any grant, are the lists of
   * the spaces the actor sees.
   *
   * @param spaceIds - The spaces.
   * @returns The ids of their lists.
   */
  async function listsOf(spaceIds: readonly string[]): Promise<string[]> {
    const rows = await asSystem<{ readonly id: string }>(
      'select id from lists where space_id = any($1::uuid[]) order by created_at, id',
      [spaceIds],
    );
    return rows.map((row) => row.id);
  }

  /**
   * Runs work in the tenant transaction of an organization, as the module of a request would, with
   * the `task_app` role and the policies of row-level security.
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
   * Creates a list or a sprint in a space as a member and checks the answer against the contract.
   *
   * @param actor - Who creates.
   * @param spaceId - The space.
   * @param body - The list.
   * @returns The list.
   */
  async function createList(actor: Person, spaceId: string, body: object): Promise<ListBody> {
    const response = await send('post', `/internal/v1/spaces/${spaceId}/lists`, actor, { body });
    expectStatus(response, 201);
    return conforms(CreateListInternalResponse, bodyOf(response));
  }

  /**
   * Creates the tasks of the fixture through the routes, then gives each the instant of its rank in
   * the order of creation, so that the ties of a sort and the pages are deterministic.
   *
   * @returns The rows of the fixture.
   */
  async function createFixture(): Promise<Row[]> {
    const listIds: Record<Seed['list'], string> = {
      backlog: backlog.id,
      recherche: rechercheList.id,
      direction: directionList.id,
      marketing: marketingFirstList.id,
    };
    const created: Row[] = [];
    for (const [index, seed] of seeds.entries()) {
      const body = {
        name: seed.name,
        priority: seed.priority,
        status: seed.status,
        assigneeIds: seed.assignees.map((person) => person.userId),
        labels: seed.labels,
        ...(seed.due === null ? {} : { dueDate: seed.due }),
        ...(seed.cancel === undefined ? {} : { cancelReason: seed.cancel }),
      };
      const creator = seed.list === 'recherche' ? hugo : camille;
      const parent = seed.parent === undefined ? undefined : created[seed.parent];
      let key: string;
      if (parent === undefined) {
        const response = await send(
          'post',
          `/internal/v1/lists/${listIds[seed.list]}/tasks`,
          creator,
          {
            body,
          },
        );
        expectStatus(response, 201);
        key = conforms(CreateTaskInternalResponse, bodyOf(response)).key;
      } else {
        const response = await send('post', `/internal/v1/tasks/${parent.key}/subtasks`, creator, {
          body,
        });
        expectStatus(response, 201);
        key = conforms(CreateSubtaskInternalResponse, bodyOf(response)).key;
      }
      created.push({ ...seed, index, key });
    }
    for (const row of created) {
      const [prefix, number] = row.key.split('-');
      await asSystem(
        `update tasks set created_at = timestamptz '2026-10-30 09:00+00' + make_interval(mins => $2)
          where organization_id = $1 and key_prefix = $3 and key_number = $4::int`,
        [atelierNordId, row.index, prefix, number],
      );
    }
    return created;
  }

  /**
   * Seeds the list "Sprint 14" of the mockup by SQL, as an import would: 98 top-level tasks, of which
   * 24 are done, 2 cancelled, 72 open and 3 late on 2026-11-08, and 150 subtasks, some of them late,
   * which no counter of a list counts. They are assigned to three members, 10 labels are spread over
   * them, and the counter of the prefix stands after them.
   */
  async function seedSprint14(): Promise<void> {
    const [counter] = await asSystem<{ readonly last_number: number }>(
      `select last_number from space_prefixes where organization_id = $1 and prefix = 'CAD'`,
      [atelierNordId],
    );
    sprint14Base = counter?.last_number ?? 0;
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status,
                          priority, due_date, completed_at, cancel_reason, created_at, created_by_type,
                          created_by_id)
       select $1, $2, $3, 'CAD', $4::int + n, 'Tâche du sprint ' || n, st.status,
              (array['urgente', 'haute', 'moyenne', 'basse'])[1 + n % 4],
              case when n in (30, 31) then date '2026-11-05' + (n - 30)
                   when n = 32 then date '2026-11-07'
                   when n = 33 then date '2026-11-08'
                   when st.status in ('done', 'cancelled') then date '2026-11-02' + (n % 5)
                   when n % 3 = 0 then null
                   else date '2026-11-08' + (n % 12) end,
              case when st.status = 'done' then timestamptz '2026-11-04 09:00+00' + n * interval '1 minute' end,
              case when st.status = 'cancelled' then 'obsolete' end,
              timestamptz '2026-10-30 16:00+00' + n * interval '1 minute', 'user', $5
         from generate_series(1, 98) as n
        cross join lateral (
              select case when n <= 24 then 'done'
                          when n <= 26 then 'cancelled'
                          else (array['todo', 'progress', 'review', 'testing', 'backlog', 'triage', 'waiting', 'blocked'])[1 + n % 8]
                     end as status) as st`,
      [atelierNordId, produit.id, sprint14.id, sprint14Base, camille.userId],
    );
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, parent_id, key_prefix, key_number, name,
                          status, priority, due_date, completed_at, created_at, created_by_type,
                          created_by_id)
       select p.organization_id, p.space_id, p.list_id, p.id, 'CAD',
              $3::int + 98 + (p.key_number - $3::int - 1) * 2 + k, 'Sous-tâche ' || k || ' de ' || p.name,
              case k when 1 then 'progress' else 'done' end, 'moyenne',
              case k when 1 then date '2026-11-01' end,
              case k when 2 then timestamptz '2026-11-05 09:00+00' end,
              timestamptz '2026-10-31 16:00+00' + (p.key_number - $3::int) * interval '1 minute' + k * interval '1 second',
              'user', $4
         from tasks p
        cross join generate_series(1, 2) as k
        where p.organization_id = $1 and p.list_id = $2 and p.parent_id is null
          and p.key_number - $3::int <= 75`,
      [atelierNordId, sprint14.id, sprint14Base, camille.userId],
    );
    await asSystem(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       select t.organization_id, t.id, (array[$4::uuid, $5::uuid, $6::uuid])[1 + (t.key_number - $3::int) % 3], 0
         from tasks t
        where t.organization_id = $1 and t.list_id = $2 and (t.key_number - $3::int) % 4 <> 0`,
      [
        atelierNordId,
        sprint14.id,
        sprint14Base,
        ...sprint14Assignees.map((person) => person.userId),
      ],
    );
    await asSystem(
      `insert into task_labels (organization_id, task_id, label_key, name, position)
       select t.organization_id, t.id, l.label_key, l.name, 0
         from tasks t
         join (values ${mockupLabels.map(([key, name], index) => `(${String(index)}, '${key}', '${name}')`).join(', ')}) as l(i, label_key, name)
           on l.i = (t.key_number - $3::int) % 10
        where t.organization_id = $1 and t.list_id = $2 and t.parent_id is null
       union all
       select t.organization_id, t.id, l.label_key, l.name, 1
         from tasks t
         join (values ${mockupLabels.map(([key, name], index) => `(${String(index)}, '${key}', '${name}')`).join(', ')}) as l(i, label_key, name)
           on l.i = ((t.key_number - $3::int) + 4) % 10
        where t.organization_id = $1 and t.list_id = $2 and t.parent_id is null
          and (t.key_number - $3::int) % 3 = 0`,
      [atelierNordId, sprint14.id, sprint14Base],
    );
    await asSystem(
      `update space_prefixes set last_number = $2 where organization_id = $1 and prefix = 'CAD'`,
      [atelierNordId, sprint14Base + 98 + 150],
    );
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
    signer = await InternalTokenSigner.create({
      issuer: 'api-gateway',
      privateJwk: gateway.privateJwk,
    });

    // The people of Atelier Nord join as organization-service would announce them.
    const people: readonly (readonly [Person, MemberJoinedV1['role']])[] = [
      [camille, 'owner'],
      [ines, 'admin'],
      [hugo, 'member'],
      [lea, 'member'],
      [nadia, 'guest'],
      [mathis, 'member'],
      [chloe, 'member'],
      [theo, 'member'],
    ];
    for (const [person, role] of people) {
      publishJoined(atelierNordId, person, role);
    }
    publishJoined(atelierDeltaId, solene, 'owner');
    await vi.waitFor(
      async () => {
        const members = await asSystem<{ readonly organization_id: string }>(
          `select organization_id from organization_members where removed_at is null`,
        );
        expect(members.filter((row) => row.organization_id === atelierNordId)).toHaveLength(
          people.length,
        );
        expect(members.filter((row) => row.organization_id === atelierDeltaId)).toHaveLength(1);
      },
      { timeout: 90_000, interval: 500 },
    );

    // The spaces, in the order that gives the sidebar its order: Produit, Marketing, then the two
    // private spaces, then the space of the sprints. The keys of Produit start at CAD-482, the task
    // of the mockup: the counter stands at 481.
    const produitCreated = await createSpace(camille, {
      name: 'Produit',
      prefix: 'CAD',
      icon: 'rocket',
      color: 'violet',
    });
    produit = produitCreated.space;
    produitFirstList = produitCreated.firstList;
    await asSystem(
      `update space_prefixes set last_number = 481 where organization_id = $1 and prefix = 'CAD'`,
      [atelierNordId],
    );
    backlog = await createList(camille, produit.id, { name: 'Backlog produit' });
    sprint14 = await createList(camille, produit.id, {
      name: 'Sprint 14',
      sprint: {
        startDate: '2026-11-03',
        endDate: '2026-11-17',
        goal: 'Livrer la connexion SSO et la page des quotas d’organisation.',
      },
    });
    sprintLists.set('Sprint 14', sprint14);

    const marketingCreated = await createSpace(camille, { name: 'Marketing', prefix: 'MKT' });
    marketing = marketingCreated.space;
    marketingFirstList = marketingCreated.firstList;
    sprintLists.set(
      'Sprint 15',
      await createList(camille, marketing.id, {
        name: 'Sprint 15',
        sprint: { startDate: '2026-11-08', endDate: '2026-11-22', goal: 'Lancer la campagne.' },
      }),
    );

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

    const sprintsCreated = await createSpace(camille, { name: 'Sprints', prefix: 'SPR' });
    sprintsSpace = sprintsCreated.space;
    sprintsFirstList = sprintsCreated.firstList;
    for (const sprint of sprints.filter((entry) => entry.space === 'Sprints')) {
      sprintLists.set(
        sprint.name,
        await createList(camille, sprintsSpace.id, {
          name: sprint.name,
          sprint: { startDate: sprint.start, endDate: sprint.end },
        }),
      );
    }

    rows = await createFixture();
    await seedSprint14();
  }, 600_000);

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

  /**
   * The rows of the fixture a viewer sees in a list.
   *
   * @param list - The list of the fixture.
   * @param person - The viewer.
   * @returns The rows, in the order of creation.
   */
  function rowsOf(list: Seed['list'], person: Person = camille): readonly Row[] {
    return rows.filter((row) => row.list === list && sees(list, person));
  }

  /**
   * The top-level rows of "Backlog produit".
   *
   * @returns The rows, in the order of creation.
   */
  function roots(): readonly Row[] {
    return rowsOf('backlog').filter((row) => row.parent === undefined);
  }

  /**
   * The names of the tasks of a page.
   *
   * @param page - A page of tasks.
   * @returns The names, in the order of the page.
   */
  function namesOf(page: { readonly items: readonly { readonly name: string }[] }): string[] {
    return page.items.map((item) => item.name);
  }

  /**
   * The names of rows.
   *
   * @param selected - Rows of the fixture.
   * @returns The names, in the same order.
   */
  function namesOfRows(selected: readonly Row[]): string[] {
    return selected.map((row) => row.name);
  }

  /**
   * Reads the tasks of "Backlog produit" as a member.
   *
   * @param query - The query parameters.
   * @param actor - Who reads, Camille by default.
   * @returns The page.
   */
  async function listBacklog(query: Query = {}, actor: Person = camille): Promise<TaskPageBody> {
    return read(ListTasksInternalResponse, `/internal/v1/lists/${backlog.id}/tasks`, actor, query);
  }

  /**
   * Follows `nextCursor` until the last page of a collection.
   *
   * @param fetchPage - Reads a page from its cursor.
   * @returns Every page, in order.
   */
  async function walk<TPage extends { readonly nextCursor: string | null }>(
    fetchPage: (cursor: string | undefined) => Promise<TPage>,
  ): Promise<TPage[]> {
    const pages: TPage[] = [];
    let cursor: string | undefined;
    do {
      const page = await fetchPage(cursor);
      pages.push(page);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined && pages.length < 500);
    return pages;
  }

  // #region The tasks of a list

  /** A filter of the route and the rule that decides which tasks it keeps. */
  interface FilterCase {
    readonly title: string;
    readonly query: Query;
    readonly keep: (row: Row) => boolean;
    readonly actor?: Person;
  }

  /**
   * Whether a task carries a label, whatever the case of its spelling.
   *
   * @param row - A task of the fixture.
   * @param name - A label.
   * @returns Whether one of the labels of the task is the same label.
   */
  function hasLabel(row: Row, name: string): boolean {
    return row.labels.some((label) => label.toLowerCase() === name.toLowerCase());
  }

  /**
   * Whether the text is found in the name, the key or a label of a task, ignoring case and accents.
   *
   * @param row - A task of the fixture.
   * @param text - The text asked.
   * @returns Whether the task matches the search.
   */
  function found(row: Row, text: string): boolean {
    const needle = fold(text);
    return (
      fold(row.name).includes(needle) ||
      fold(row.key).includes(needle) ||
      row.labels.some((label) => fold(label).includes(needle))
    );
  }

  /**
   * Whether a task is assigned to an account.
   *
   * @param row - A task of the fixture.
   * @param person - The account.
   * @returns Whether the account is one of its assignees.
   */
  function isAssignedTo(row: Row, person: Person): boolean {
    return row.assignees.some((assignee) => assignee.userId === person.userId);
  }

  const filterCases: readonly FilterCase[] = [
    {
      title: 'status keeps the tasks in any of the statuses asked',
      query: { status: 'progress,review' },
      keep: (row) => row.status === 'progress' || row.status === 'review',
    },
    {
      title: 'status "done" keeps the done tasks only, not the cancelled ones',
      query: { status: 'done' },
      keep: (row) => row.status === 'done',
    },
    {
      title: 'priority keeps the tasks of any of the priorities asked',
      query: { priority: 'urgente,haute' },
      keep: (row) => row.priority === 'urgente' || row.priority === 'haute',
    },
    {
      title: 'assignee "me" is the caller',
      query: { assignee: 'me' },
      keep: (row) => isAssignedTo(row, camille),
    },
    {
      title: 'assignee "me" is Léa when Léa asks',
      query: { assignee: 'me' },
      keep: (row) => isAssignedTo(row, lea),
      actor: lea,
    },
    {
      title: 'assignee "none" keeps the tasks nobody is assigned to',
      query: { assignee: 'none' },
      keep: (row) => row.assignees.length === 0,
    },
    {
      title: 'assignee "me,none" adds the caller’s tasks and the unassigned ones',
      query: { assignee: 'me,none' },
      keep: (row) => isAssignedTo(row, camille) || row.assignees.length === 0,
    },
    {
      title: 'assignee takes account ids, in either case, and adds them up',
      query: { assignee: `${hugo.userId},${theo.userId.toUpperCase()}` },
      keep: (row) => isAssignedTo(row, hugo) || isAssignedTo(row, theo),
    },
    {
      title: 'assignee keeps the tasks of an account that is a guest or a stranger empty',
      query: { assignee: nadia.userId },
      keep: () => false,
    },
    {
      title: 'label ignores case: "AUTH" finds "Auth" and "auth"',
      query: { label: 'AUTH' },
      keep: (row) => hasLabel(row, 'auth'),
    },
    {
      title: 'label keeps accents significant for a spelling in upper case',
      query: { label: 'SÉCURITÉ' },
      keep: (row) => hasLabel(row, 'sécurité'),
    },
    {
      title: 'label without its accents is another label and finds nothing',
      query: { label: 'securite' },
      keep: () => false,
    },
    {
      title: 'label adds the labels asked up',
      query: { label: 'docs,Contenu' },
      keep: (row) => hasLabel(row, 'docs') || hasLabel(row, 'contenu'),
    },
    {
      title: 'search finds a word of the name ignoring case',
      query: { search: 'SSO' },
      keep: (row) => found(row, 'sso'),
    },
    {
      title: 'search ignores accents on both sides: "elaborer" finds "élaborer"',
      query: { search: 'elaborer' },
      keep: (row) => found(row, 'elaborer'),
    },
    {
      title: 'search ignores accents on both sides: "ÉCRAN" finds "écran"',
      query: { search: 'ÉCRAN' },
      keep: (row) => found(row, 'ecran'),
    },
    {
      title: 'search finds the labels: "facturation" finds the name and the label',
      query: { search: 'facturation' },
      keep: (row) => found(row, 'facturation'),
    },
    {
      title: 'search finds an accented label from its plain spelling',
      query: { search: 'securite' },
      keep: (row) => found(row, 'securite'),
    },
    {
      title: 'search finds a task by a part of its key',
      query: { search: 'cad-48' },
      keep: (row) => found(row, 'cad-48'),
    },
    {
      title: 'search takes "%" and "_" as plain characters, not as wildcards',
      query: { search: '100 %' },
      keep: (row) => row.name.includes('100 %'),
    },
    {
      title: 'search takes "_" as a plain character',
      query: { search: 'e_x' },
      keep: (row) => row.name.includes('e_x'),
    },
    {
      title: 'search finds nothing for a text no task holds',
      query: { search: 'introuvable' },
      keep: () => false,
    },
    {
      title: 'dueFrom keeps the tasks due on that day or later, and leaves the undated out',
      query: { dueFrom: '2026-11-09' },
      keep: (row) => row.due !== null && row.due >= '2026-11-09',
    },
    {
      title: 'dueTo keeps the tasks due on that day or before, and leaves the undated out',
      query: { dueTo: '2026-11-08' },
      keep: (row) => row.due !== null && row.due <= '2026-11-08',
    },
    {
      title: 'dueFrom and dueTo are inclusive at both ends',
      query: { dueFrom: '2026-11-08', dueTo: '2026-11-10' },
      keep: (row) => row.due !== null && row.due >= '2026-11-08' && row.due <= '2026-11-10',
    },
    {
      title: 'a single day is a range of one day',
      query: { dueFrom: '2026-11-13', dueTo: '2026-11-13' },
      keep: (row) => row.due === '2026-11-13',
    },
    {
      title: 'dueFrom after dueTo gives an empty result, not an error',
      query: { dueFrom: '2026-11-20', dueTo: '2026-11-01' },
      keep: () => false,
    },
    {
      title: 'filters narrow each other: status, priority, assignee and due date together',
      query: {
        status: 'todo,progress,review',
        priority: 'haute,urgente,basse',
        assignee: 'me',
        dueTo: '2026-11-20',
      },
      keep: (row) =>
        ['todo', 'progress', 'review'].includes(row.status) &&
        ['haute', 'urgente', 'basse'].includes(row.priority) &&
        isAssignedTo(row, camille) &&
        row.due !== null &&
        row.due <= '2026-11-20',
    },
    {
      title: 'filters narrow each other: a label, a search and an assignee together',
      query: { label: 'auth', search: 'sso', assignee: `${hugo.userId},none` },
      keep: (row) =>
        hasLabel(row, 'auth') &&
        found(row, 'sso') &&
        (isAssignedTo(row, hugo) || row.assignees.length === 0),
    },
  ];

  describe('the tasks of a list keep what the filters ask, and each filter narrows the others', () => {
    it('lists the top-level tasks in the order of creation by default, with their total and no cursor', async () => {
      const page = await listBacklog();

      expect(namesOf(page)).toEqual(namesOfRows(roots()));
      expect(page).toMatchObject({ total: roots().length, nextCursor: null });
      expect(page.items.map((item) => item.key)).toEqual(roots().map((row) => row.key));
      expect(page.items[0]).toMatchObject({
        key: 'CAD-482',
        name: 'Refondre l’écran de connexion SSO',
        status: 'progress',
        priority: 'haute',
        assignees: [{ userId: camille.userId }, { userId: hugo.userId }],
        dueDate: '2026-11-13',
        labels: ['Design', 'Auth'],
        parentKey: null,
        listId: backlog.id,
        spaceId: produit.id,
        subtaskCounts: { total: 2, closed: 1 },
      });
    });

    it('adds the subtasks, as tasks, when the level is "all", and counts them in the total', async () => {
      const page = await listBacklog({ level: 'all' });

      expect(namesOf(page)).toEqual(namesOfRows(rowsOf('backlog')));
      expect(page.total).toBe(rowsOf('backlog').length);
      expect(page.items.filter((item) => item.parentKey !== null).map((item) => item.name)).toEqual(
        ['Maquette validée', 'Revue sécurité', 'Jeu de données', 'Script', 'Axe des ordonnées'],
      );
    });

    it('keeps the top-level tasks only when the level is "roots"', async () => {
      const page = await listBacklog({ level: 'roots' });

      expect(page.items.every((item) => item.parentKey === null)).toBe(true);
      expect(page.total).toBe(roots().length);
    });

    for (const level of ['roots', 'all'] as const) {
      for (const filterCase of filterCases) {
        it(`${filterCase.title} (level ${level})`, async () => {
          const base = level === 'roots' ? roots() : rowsOf('backlog');
          const expected = base.filter(filterCase.keep);

          const page = await listBacklog(
            { ...filterCase.query, level },
            filterCase.actor ?? camille,
          );

          expect(namesOf(page)).toEqual(namesOfRows(expected));
          expect(page).toMatchObject({ total: expected.length, nextCursor: null });
        });
      }
    }

    it('answers the same total on every page, whatever the page size', async () => {
      const expected = roots().filter((row) => row.status !== 'done');

      const pages = await walk((cursor) =>
        listBacklog({
          status: 'triage,backlog,todo,progress,review,testing,waiting,blocked,cancelled',
          limit: 3,
          cursor,
        }),
      );

      expect(pages.map((page) => page.total)).toEqual(pages.map(() => expected.length));
      expect(pages.flatMap((page) => namesOf(page))).toEqual(namesOfRows(expected));
    });

    it('reads a repeated parameter like a comma-separated one', async () => {
      const response = await send(
        'get',
        `/internal/v1/lists/${backlog.id}/tasks?status=progress&status=review&label=auth&label=back`,
        camille,
      );

      expectStatus(response, 200);
      const page = conforms(ListTasksInternalResponse, bodyOf(response));
      expect(namesOf(page)).toEqual(
        namesOfRows(
          roots().filter(
            (row) =>
              ['progress', 'review'].includes(row.status) &&
              (hasLabel(row, 'auth') || hasLabel(row, 'back')),
          ),
        ),
      );
    });
  });

  const sortTitles: Readonly<Record<string, string>> = {
    manual: 'manual is the order of creation, the order of the list in this version',
    '-manual': '-manual reverses the order of creation',
    createdAt: 'createdAt is the order of creation',
    '-createdAt': '-createdAt reverses the order of creation',
    dueDate: 'dueDate goes from the earliest, the undated last',
    '-dueDate': '-dueDate goes from the latest, the undated still last',
    priority: 'priority goes from urgente to basse, ties in the order of the list',
    '-priority': '-priority goes from basse to urgente, ties still in the order of the list',
    name: 'name ignores case and accents, ties in the order of the list',
    '-name': '-name reverses the names, ties still in the order of the list',
  };

  describe('the sorts follow the contract, and a task without a due date is always last', () => {
    for (const [sort, title] of Object.entries(sortTitles)) {
      it(`${title} (${sort})`, async () => {
        const expected = [...roots()].sort(comparatorOf(sort));

        const page = await listBacklog({ sort });

        expect(namesOf(page)).toEqual(namesOfRows(expected));
        expect(page.total).toBe(roots().length);
      });

      it(`sorts the subtasks in with the others by ${sort} when the level is "all"`, async () => {
        const expected = [...rowsOf('backlog')].sort(comparatorOf(sort));

        const page = await listBacklog({ sort, level: 'all' });

        expect(namesOf(page)).toEqual(namesOfRows(expected));
      });
    }

    it('puts the five undated tasks last in the order of creation, going up or down by due date', async () => {
      const undated = [
        'élaborer le cahier des charges',
        'Revue de code',
        'revue de code',
        'Ajouter la connexion par lien magique',
        'Rédiger la newsletter',
      ];

      const ascending = await listBacklog({ sort: 'dueDate' });
      const descending = await listBacklog({ sort: '-dueDate' });

      expect(namesOf(ascending).slice(-5)).toEqual(undated);
      expect(namesOf(descending).slice(-5)).toEqual(undated);
      expect(namesOf(ascending)[0]).toBe('Étude de la facturation SSO');
      expect(namesOf(descending).slice(0, 2)).toEqual([
        'Documentation de l’API',
        'Tâche 100 % couverte_x',
      ]);
    });

    it('keeps the order of the list among the ties of a reversed key, but reverses it for -manual', async () => {
      const urgent = ['Corriger le bug du calendrier', 'Sécurité des sessions', 'Préparer la démo'];

      const priority = await listBacklog({ sort: 'priority' });
      const lowest = await listBacklog({ sort: '-priority' });
      const manual = await listBacklog({ sort: '-manual' });

      expect(namesOf(priority).slice(0, 3)).toEqual(urgent);
      expect(namesOf(lowest).slice(-3)).toEqual(urgent);
      expect(namesOf(lowest).slice(0, 2)).toEqual([
        'Écran des événements à venir',
        'élaborer le cahier des charges',
      ]);
      expect(namesOf(manual)[0]).toBe('Tâche 100 % couverte_x');
    });

    it('sorts names without regard to case or accents, and keeps "Revue de code" before "revue de code"', async () => {
      const page = await listBacklog({ sort: 'name' });

      expect(namesOf(page).slice(3, 8)).toEqual([
        'Documentation de l’API',
        'Écran des événements à venir',
        'élaborer le cahier des charges',
        'Étude de la facturation SSO',
        'Exporter les tâches en CSV',
      ]);
      const names = namesOf(page);
      expect(names.indexOf('Revue de code') + 1).toBe(names.indexOf('revue de code'));
    });

    it('walks every sort page by page with the cursor, without a repeat or a gap, and the same total', async () => {
      for (const sort of Object.keys(sortTitles)) {
        for (const level of ['roots', 'all'] as const) {
          const base = level === 'roots' ? roots() : rowsOf('backlog');
          const expected = [...base].sort(comparatorOf(sort));

          const pages = await walk((cursor) => listBacklog({ sort, level, limit: 4, cursor }));

          expect(pages).toHaveLength(Math.ceil(expected.length / 4));
          expect(pages.flatMap((page) => namesOf(page))).toEqual(namesOfRows(expected));
          expect(pages.map((page) => page.total)).toEqual(pages.map(() => expected.length));
          expect(pages.at(-1)?.nextCursor).toBeNull();
          expect(pages.slice(0, -1).every((page) => page.nextCursor !== null)).toBe(true);
        }
      }
    });

    it('walks a filtered page-by-page list one task at a time', async () => {
      const expected = roots()
        .filter((row) => hasLabel(row, 'auth'))
        .sort(comparatorOf('-dueDate'));

      const pages = await walk((cursor) =>
        listBacklog({ label: 'auth', sort: '-dueDate', limit: 1, cursor }),
      );

      expect(pages.flatMap((page) => namesOf(page))).toEqual(namesOfRows(expected));
      expect(pages).toHaveLength(expected.length);
    });
  });

  describe('the page size is between 1 and 100 tasks, 50 by default', () => {
    it('answers every task of the list when the limit is 100, and one task when it is 1', async () => {
      const wide = await listBacklog({ limit: 100 });
      const narrow = await listBacklog({ limit: 1 });

      expect(wide.items).toHaveLength(roots().length);
      expect(wide.nextCursor).toBeNull();
      expect(narrow.items).toHaveLength(1);
      expect(narrow.nextCursor).not.toBeNull();
      expect(narrow.total).toBe(roots().length);
    });

    it('answers 400 request.invalid to a limit of 0, 101, -1 or a word', async () => {
      for (const limit of ['0', '101', '-1', 'many', '1.5']) {
        expectProblem(
          await refused(`/internal/v1/lists/${backlog.id}/tasks`, camille, { limit }),
          400,
          'request.invalid',
        );
      }
    });
  });

  // #endregion

  // #region The groups

  /**
   * The groups the reference model expects for a grouping.
   *
   * @param selected - The tasks that match the filters.
   * @param grouping - What the tasks are counted by.
   * @returns The groups, in the order the contract gives them.
   */
  function expectedGroups(
    selected: readonly Row[],
    grouping: 'status' | 'priority' | 'assignee',
  ): { value: string; count: number }[] {
    if (grouping === 'status') {
      return STATUS_KEYS.map((value) => ({
        value,
        count: selected.filter((row) => row.status === value).length,
      }));
    }
    if (grouping === 'priority') {
      return PRIORITY_KEYS.map((value) => ({
        value,
        count: selected.filter((row) => row.priority === value).length,
      }));
    }
    const counts = new Map<string, number>();
    for (const row of selected) {
      for (const assignee of row.assignees) {
        counts.set(assignee.userId, (counts.get(assignee.userId) ?? 0) + 1);
      }
    }
    const people = [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => right.count - left.count || byCodePoint(left.value, right.value));
    return [
      ...people,
      { value: 'none', count: selected.filter((row) => row.assignees.length === 0).length },
    ];
  }

  /**
   * Reads the groups of "Backlog produit".
   *
   * @param query - The query parameters.
   * @param actor - Who reads, Camille by default.
   * @returns The page of groups.
   */
  async function groupsOf(query: Query, actor: Person = camille): Promise<GroupPageBody> {
    return read(
      CountTaskGroupsInternalResponse,
      `/internal/v1/lists/${backlog.id}/task-groups`,
      actor,
      query,
    );
  }

  describe('the groups count the tasks that match the filters, each task once', () => {
    it('counts the ten statuses in the order of the workflow, with a zero for those no task holds', async () => {
      const page = await groupsOf({ groupBy: 'status' });

      expect(page.items.map((group) => group.value)).toEqual([...STATUS_KEYS]);
      expect(page.items).toEqual(expectedGroups(roots(), 'status'));
      const urgent = await groupsOf({ groupBy: 'status', priority: 'urgente' });
      expect(urgent.items.map((group) => group.value)).toEqual([...STATUS_KEYS]);
      expect(urgent.items.filter((group) => group.count === 0)).toHaveLength(7);
      expect(urgent.items.filter((group) => group.count > 0).map((group) => group.value)).toEqual([
        'progress',
        'review',
        'blocked',
      ]);
      expect(page).toMatchObject({ groupBy: 'status', total: roots().length, nextCursor: null });
    });

    it('counts the four priorities from urgente to basse, zeros included', async () => {
      const page = await groupsOf({ groupBy: 'priority', status: 'done,cancelled' });

      expect(page.items).toEqual([
        { value: 'urgente', count: 0 },
        { value: 'haute', count: 0 },
        { value: 'moyenne', count: 2 },
        { value: 'basse', count: 2 },
      ]);
      expect(page).toMatchObject({ groupBy: 'priority', total: 4 });
    });

    it('counts every priority of the list, and the total adds them up', async () => {
      const page = await groupsOf({ groupBy: 'priority' });

      expect(page.items).toEqual(expectedGroups(roots(), 'priority'));
      expect(page.total).toBe(page.items.reduce((sum, group) => sum + group.count, 0));
    });

    it('counts a task once in the total and once for each of its assignees in the groups', async () => {
      const page = await groupsOf({ groupBy: 'assignee' });

      expect(page.items).toEqual(expectedGroups(roots(), 'assignee'));
      expect(page.total).toBe(roots().length);
      expect(page.items.reduce((sum, group) => sum + group.count, 0)).toBeGreaterThan(page.total);
      expect(page.items.at(-1)).toEqual({
        value: 'none',
        count: roots().filter((row) => row.assignees.length === 0).length,
      });
    });

    it('orders the assignees by count, then by account, and puts "none" last', async () => {
      const page = await groupsOf({ groupBy: 'assignee' });

      const counts = page.items.slice(0, -1).map((group) => group.count);
      expect(counts).toEqual([...counts].sort((left, right) => right - left));
      expect(page.items.map((group) => group.value)).toEqual([
        theo.userId,
        camille.userId,
        hugo.userId,
        lea.userId,
        'none',
      ]);
    });

    it('keeps the group "none" at zero when every matching task has an assignee', async () => {
      const page = await groupsOf({ groupBy: 'assignee', assignee: hugo.userId });

      const expected = roots().filter((row) => isAssignedTo(row, hugo));
      expect(page.items).toEqual(expectedGroups(expected, 'assignee'));
      expect(page.items.at(-1)).toEqual({ value: 'none', count: 0 });
      expect(page.total).toBe(expected.length);
    });

    it('counts the tasks that match the filters of the list, as the list does', async () => {
      const query = { status: 'todo,progress,review', label: 'auth,design', dueTo: '2026-11-13' };
      const expected = roots().filter(
        (row) =>
          ['todo', 'progress', 'review'].includes(row.status) &&
          (hasLabel(row, 'auth') || hasLabel(row, 'design')) &&
          row.due !== null &&
          row.due <= '2026-11-13',
      );

      const byStatus = await groupsOf({ groupBy: 'status', ...query });
      const byAssignee = await groupsOf({ groupBy: 'assignee', ...query });
      const tasks = await listBacklog(query);

      expect(byStatus.items).toEqual(expectedGroups(expected, 'status'));
      expect(byAssignee.items).toEqual(expectedGroups(expected, 'assignee'));
      expect(byStatus.total).toBe(tasks.total);
      expect(byAssignee.total).toBe(tasks.total);
      expect(tasks.total).toBe(expected.length);
    });

    it('counts the subtasks too when the level is "all"', async () => {
      const page = await groupsOf({ groupBy: 'status', level: 'all' });

      expect(page.items).toEqual(expectedGroups(rowsOf('backlog'), 'status'));
      expect(page.total).toBe(rowsOf('backlog').length);
    });

    it('takes "me" and "none" as filters of the groups, and the search ignoring case and accents', async () => {
      const page = await groupsOf({ groupBy: 'priority', assignee: 'me,none', search: 'ÉCRAN' });

      const expected = roots().filter(
        (row) => (isAssignedTo(row, camille) || row.assignees.length === 0) && found(row, 'ecran'),
      );
      expect(page.items).toEqual(expectedGroups(expected, 'priority'));
      expect(page.total).toBe(expected.length);
    });

    it('pages the groups by count, with the same total and the groups of every page in order', async () => {
      for (const [grouping, size] of [
        ['status', 3],
        ['priority', 1],
        ['assignee', 2],
      ] as const) {
        const expected = expectedGroups(roots(), grouping);

        const pages = await walk((cursor) => groupsOf({ groupBy: grouping, limit: size, cursor }));

        expect(pages.flatMap((page) => page.items)).toEqual(expected);
        expect(pages).toHaveLength(Math.ceil(expected.length / size));
        expect(pages.map((page) => page.total)).toEqual(pages.map(() => roots().length));
        expect(pages.every((page) => page.groupBy === grouping)).toBe(true);
        expect(pages.at(-1)?.nextCursor).toBeNull();
      }
    });

    it('answers 400 request.invalid without groupBy, with another one, or with a limit out of 1 to 100', async () => {
      const path = `/internal/v1/lists/${backlog.id}/task-groups`;

      for (const query of [
        {},
        { groupBy: 'label' },
        { groupBy: 'status', limit: 0 },
        { groupBy: 'status', limit: 101 },
      ]) {
        expectProblem(await refused(path, camille, query), 400, 'request.invalid');
      }
    });
  });

  // #endregion

  // #region The counts of a list, the overview and the labels

  /**
   * The counters the reference model expects for the tasks of a list: the top-level tasks only.
   *
   * @param selected - The tasks of the list, subtasks included.
   * @param on - The date of the caller.
   * @returns The counters.
   */
  function countsOf(selected: readonly Row[], on: string): Counts {
    const top = selected.filter((row) => row.parent === undefined);
    const open = top.filter((row) => !isClosed(row.status));
    return {
      total: top.length,
      open: open.length,
      done: top.filter((row) => row.status === 'done').length,
      cancelled: top.filter((row) => row.status === 'cancelled').length,
      late: open.filter((row) => row.due !== null && row.due < on).length,
    };
  }

  /**
   * The counters of the "Sprint 14" seed on a date, computed by SQL from its rows: the top-level
   * tasks that are not closed and due strictly before the date.
   *
   * @param on - The date of the caller.
   * @returns The counters.
   */
  async function sprint14CountsBySql(on: string): Promise<Counts> {
    const [row] = await asSystem<Counts>(
      `select count(*)::int as total,
              (count(*) filter (where status not in ('done', 'cancelled')))::int as open,
              (count(*) filter (where status = 'done'))::int as done,
              (count(*) filter (where status = 'cancelled'))::int as cancelled,
              (count(*) filter (where status not in ('done', 'cancelled') and due_date < $3::date))::int as late
         from tasks where organization_id = $1 and list_id = $2 and parent_id is null`,
      [atelierNordId, sprint14.id, on],
    );
    if (row === undefined) {
      throw new Error('The counters of Sprint 14 could not be read.');
    }
    return row;
  }

  /**
   * Reads the counters of a list.
   *
   * @param listId - The list.
   * @param on - The date of the caller.
   * @param actor - Who reads, Camille by default.
   * @returns The list and its counters.
   */
  async function countsOfList(
    listId: string,
    on: string = today,
    actor: Person = camille,
  ): Promise<ListCountsBody> {
    return read(GetListCountsInternalResponse, `/internal/v1/lists/${listId}/counts`, actor, {
      today: on,
    });
  }

  /**
   * Reads the overview of a space.
   *
   * @param spaceId - The space.
   * @param query - The query parameters; `today` is the date of the scenarios by default.
   * @param actor - Who reads, Camille by default.
   * @returns The overview.
   */
  async function overviewOf(
    spaceId: string,
    query: Query = {},
    actor: Person = camille,
  ): Promise<OverviewBody> {
    return read(
      GetSpaceOverviewInternalResponse,
      `/internal/v1/spaces/${spaceId}/overview`,
      actor,
      { today, ...query },
    );
  }

  const noCounts: Counts = { total: 0, open: 0, done: 0, cancelled: 0, late: 0 };
  const sprint14Counts: Counts = { total: 98, open: 72, done: 24, cancelled: 2, late: 3 };

  describe('the counters of a list count its top-level tasks, « Terminées » being the done ones', () => {
    it('counts "Backlog produit": all, open, done, cancelled and late before the date of the caller', async () => {
      const body = await countsOfList(backlog.id);

      expect(body.counts).toEqual(countsOf(rowsOf('backlog'), today));
      expect(body.counts).toEqual({ total: 20, open: 16, done: 2, cancelled: 2, late: 1 });
      expect(body.list).toMatchObject({
        id: backlog.id,
        spaceId: produit.id,
        name: 'Backlog produit',
        sprint: null,
      });
    });

    it('leaves the subtasks out of every counter, the late ones included', async () => {
      const body = await countsOfList(backlog.id, '2026-11-09');

      // "Axe des ordonnées", "Revue sécurité" and the other subtasks are late on that date, not counted.
      expect(body.counts).toEqual(countsOf(rowsOf('backlog'), '2026-11-09'));
      expect(body.counts.total).toBe(20);
    });

    it('counts a task late strictly before the date: due on the day is not late, and a closed task never is', async () => {
      expect((await countsOfList(backlog.id, '2026-11-06')).counts.late).toBe(0);
      expect((await countsOfList(backlog.id, '2026-11-07')).counts.late).toBe(1);
      // "Intégrer le SSO du fournisseur" is cancelled and due 2026-11-07, "Exporter" is done and due
      // 2026-11-04: neither is late on 2026-11-30.
      const later = await countsOfList(backlog.id, '2026-12-01');
      expect(later.counts).toEqual(countsOf(rowsOf('backlog'), '2026-12-01'));
      expect(later.counts.late).toBe(later.counts.open - 4);
    });

    it('answers zeros for a list without a task', async () => {
      const body = await countsOfList(produitFirstList.id);

      expect(body.counts).toEqual(noCounts);
      expect(body.list).toMatchObject({ id: produitFirstList.id, name: 'Première liste' });
    });

    it('describes a sprint with its dates and its goal', async () => {
      const body = await countsOfList(sprint14.id);

      expect(body.list).toMatchObject({
        id: sprint14.id,
        name: 'Sprint 14',
        sprint: {
          startDate: '2026-11-03',
          endDate: '2026-11-17',
          goal: 'Livrer la connexion SSO et la page des quotas d’organisation.',
        },
      });
    });

    it('returns for Sprint 14 exactly the counters of the contract: 98 tasks, 72 open, 24 done, 2 cancelled, 3 late', async () => {
      const response = await send(
        'get',
        `/internal/v1/lists/${sprint14.id}/counts?today=2026-11-08`,
        camille,
      );

      expectStatus(response, 200);
      expect(conforms(GetListCountsInternalResponse, bodyOf(response)).counts).toEqual(
        sprint14Counts,
      );
      expect(await sprint14CountsBySql(today)).toEqual(sprint14Counts);
    });

    it('moves the late tasks of Sprint 14 with the date of the caller, as the SQL does', async () => {
      for (const on of [
        '2026-11-05',
        '2026-11-06',
        '2026-11-07',
        '2026-11-08',
        '2026-11-09',
        '2027-01-01',
      ]) {
        expect((await countsOfList(sprint14.id, on)).counts).toEqual(await sprint14CountsBySql(on));
      }
      expect((await countsOfList(sprint14.id, '2026-11-05')).counts.late).toBe(0);
      expect((await countsOfList(sprint14.id, '2026-11-06')).counts.late).toBe(1);
      expect((await countsOfList(sprint14.id, '2026-11-08')).counts.late).toBe(3);
      expect((await countsOfList(sprint14.id, '2026-11-09')).counts.late).toBe(4);
    });

    it('counts the lists of Marketing as they stand', async () => {
      expect((await countsOfList(marketingFirstList.id)).counts).toEqual({
        total: 3,
        open: 2,
        done: 1,
        cancelled: 0,
        late: 1,
      });
    });
  });

  describe('the overview of a space lists its lists in the order of creation, with the counters of each', () => {
    it('lists "Première liste", "Backlog produit" and "Sprint 14" with their counters, zeros for the empty one', async () => {
      const body = await overviewOf(produit.id);

      expect(body.spaceId).toBe(produit.id);
      expect(body.items.map((item) => item.list.name)).toEqual([
        'Première liste',
        'Backlog produit',
        'Sprint 14',
      ]);
      expect(body.items.map((item) => item.counts)).toEqual([
        noCounts,
        countsOf(rowsOf('backlog'), today),
        sprint14Counts,
      ]);
      expect(body).toMatchObject({ listCount: 3, taskCount: 20 + 98, nextCursor: null });
    });

    it('answers listCount and taskCount of the whole space on every page, whatever the page size', async () => {
      const pages = await walk((cursor) => overviewOf(produit.id, { limit: 1, cursor }));

      expect(pages).toHaveLength(3);
      expect(pages.map((page) => page.items.map((item) => item.list.name))).toEqual([
        ['Première liste'],
        ['Backlog produit'],
        ['Sprint 14'],
      ]);
      expect(pages.map((page) => [page.listCount, page.taskCount])).toEqual([
        [3, 118],
        [3, 118],
        [3, 118],
      ]);
      expect(pages.at(-1)?.nextCursor).toBeNull();
    });

    it('counts the top-level tasks only in taskCount', async () => {
      const body = await overviewOf(marketing.id);

      expect(body.items.map((item) => item.list.name)).toEqual(['Première liste', 'Sprint 15']);
      expect(body.items.map((item) => item.counts.total)).toEqual([3, 0]);
      expect(body).toMatchObject({ listCount: 2, taskCount: 3 });
    });

    it('shows the private space of Hugo to Hugo alone, as the 404 space.not-found of the others', async () => {
      const own = await overviewOf(recherche.id, {}, hugo);

      expect(own).toMatchObject({ listCount: 1, taskCount: 1 });
      for (const viewer of [camille, ines, lea, theo, nadia]) {
        expectProblem(
          await refused(`/internal/v1/spaces/${recherche.id}/overview`, viewer, { today }),
          404,
          'space.not-found',
        );
      }
    });

    it('answers 404 space.not-found to a space that does not exist, and to a guest on every space', async () => {
      expectProblem(
        await refused(`/internal/v1/spaces/${randomUUID()}/overview`, camille, { today }),
        404,
        'space.not-found',
      );
      expectProblem(
        await refused(`/internal/v1/spaces/${produit.id}/overview`, nadia, { today }),
        404,
        'space.not-found',
      );
    });
  });

  /**
   * The labels the reference model expects a viewer to see: the labels of the tasks of the spaces
   * the viewer sees, once per label whatever the case, spelled as the first spelling in code point
   * order among those rows, in the order of the folded key. Sprint 14 holds the ten labels of the
   * mockup.
   *
   * @param person - The viewer.
   * @returns The names of the labels.
   */
  function expectedLabels(person: Person): string[] {
    const spellings = new Map<string, string>();
    const visible = [
      ...mockupLabels.map(([, name]) => name),
      ...rows.filter((row) => sees(row.list, person)).flatMap((row) => row.labels),
    ];
    for (const name of visible) {
      const key = name.toLowerCase();
      const known = spellings.get(key);
      if (known === undefined || byCodePoint(name, known) < 0) {
        spellings.set(key, name);
      }
    }
    return [...spellings]
      .sort(([left], [right]) => byCodePoint(fold(left), fold(right)) || byCodePoint(left, right))
      .map(([, name]) => name);
  }

  /**
   * Reads the labels as a member.
   *
   * @param query - The query parameters.
   * @param actor - Who reads, Camille by default.
   * @returns The page.
   */
  async function labelsOf(query: Query = {}, actor: Person = camille): Promise<LabelPageBody> {
    return read(ListLabelsInternalResponse, '/internal/v1/labels', actor, query);
  }

  describe('the labels are those of the tasks the caller sees, one per label whatever its case', () => {
    it('lists the ten labels of the mockup, and the one of the private space of Camille, in the order of their folded key', async () => {
      const page = await labelsOf();

      expect(page.items.map((label) => label.name)).toEqual([
        'Auth',
        'Back',
        'Budget',
        'Bug',
        'Contenu',
        'Design',
        'Docs',
        'Facturation',
        'Front',
        'Recherche',
        'Sécurité',
      ]);
      expect(page.items.map((label) => label.name)).toEqual(expectedLabels(camille));
      expect(page.nextCursor).toBeNull();
    });

    it('lists "Auth", "auth" and "AUTH" as one label, spelled "Auth" over the tasks Camille sees', async () => {
      const page = await labelsOf({ search: 'auth' });

      expect(page.items).toEqual([{ name: 'Auth' }]);
    });

    it('spells "AUTH" for Hugo, whose private space holds that spelling, and adds his own label', async () => {
      const page = await labelsOf({}, hugo);

      expect(page.items.map((label) => label.name)).toEqual(expectedLabels(hugo));
      expect(page.items.map((label) => label.name)).toContain('AUTH');
      expect(page.items.map((label) => label.name)).toContain('Confidentiel');
      expect(page.items.map((label) => label.name)).not.toContain('Budget');
    });

    it('leaves out the labels of the private space of another member, and their spelling', async () => {
      for (const viewer of [camille, ines, lea, theo]) {
        const names = (await labelsOf({}, viewer)).items.map((label) => label.name);

        expect(names).not.toContain('Confidentiel');
        expect(names).not.toContain('AUTH');
      }
      expect((await labelsOf({}, theo)).items.map((label) => label.name)).not.toContain('Budget');
    });

    it('searches ignoring case and accents, in the label itself', async () => {
      expect((await labelsOf({ search: 'SECURITE' })).items).toEqual([{ name: 'Sécurité' }]);
      expect((await labelsOf({ search: 'sécu' })).items).toEqual([{ name: 'Sécurité' }]);
      expect((await labelsOf({ search: 'bu' })).items).toEqual([
        { name: 'Budget' },
        { name: 'Bug' },
      ]);
      expect((await labelsOf({ search: 'introuvable' })).items).toEqual([]);
      expect((await labelsOf({ search: 'CONF' }, hugo)).items).toEqual([{ name: 'Confidentiel' }]);
    });

    it('pages the labels with the cursor, three at a time, without a repeat or a gap', async () => {
      const pages = await walk((cursor) => labelsOf({ limit: 3, cursor }));

      expect(pages.map((page) => page.items.length)).toEqual([3, 3, 3, 2]);
      expect(pages.flatMap((page) => page.items.map((label) => label.name))).toEqual(
        expectedLabels(camille),
      );
      expect(pages.at(-1)?.nextCursor).toBeNull();
    });

    it('lists the labels of the tasks of the subtasks too', async () => {
      const names = (await labelsOf({ search: 'design' })).items;

      expect(names).toEqual([{ name: 'Design' }]);
    });

    it('answers an empty page to a guest', async () => {
      expect(await labelsOf({}, nadia)).toEqual({ items: [], nextCursor: null });
    });
  });

  // #endregion

  // #region Mes tâches and Accueil

  /**
   * The tasks assigned to a person in the spaces they see, in the order of "Mes tâches": by due
   * date with the undated last, then in the order of creation.
   *
   * @param person - The person.
   * @param state - The tab.
   * @returns The rows, subtasks included.
   */
  function assignedTo(person: Person, state: 'open' | 'closed'): readonly Row[] {
    return rows
      .filter(
        (row) =>
          isAssignedTo(row, person) &&
          sees(row.list, person) &&
          isClosed(row.status) === (state === 'closed'),
      )
      .sort(byDueThenCreation);
  }

  /**
   * Reads "Mes tâches".
   *
   * @param actor - Whose tasks, and who reads.
   * @param query - The query parameters.
   * @returns The page.
   */
  async function myTasksOf(actor: Person, query: Query = {}): Promise<MyTaskPageBody> {
    return read(
      ListMyTasksInternalResponse,
      `/internal/v1/users/${actor.userId}/tasks`,
      actor,
      query,
    );
  }

  /**
   * Reads "Accueil".
   *
   * @param actor - Whose home, and who reads.
   * @param on - The date of the caller.
   * @returns The home.
   */
  async function homeOf(actor: Person, on: string = today): Promise<HomeBody> {
    return read(GetHomeInternalResponse, `/internal/v1/users/${actor.userId}/home`, actor, {
      today: on,
    });
  }

  describe('"Mes tâches" lists the tasks assigned to the caller, subtasks included, by due date', () => {
    it('lists the open tab by due date, the undated last, then by creation, with the subtasks among them', async () => {
      const page = await myTasksOf(theo);

      expect(namesOf(page)).toEqual(namesOfRows(assignedTo(theo, 'open')));
      expect(namesOf(page)).toEqual([
        'Axe des ordonnées',
        'Écran des événements à venir',
        'Sécurité des sessions',
        'Jeu de données',
        'Notifications par courriel',
        'Page des quotas d’organisation',
        'Préparer la démo',
        'Zèbre du tableau de bord',
        'Mise à jour de la facturation',
        'Revue de code',
      ]);
      expect(page.nextCursor).toBeNull();
    });

    it('lists the closed tab, « Terminées », with the done and the cancelled tasks', async () => {
      const page = await myTasksOf(theo, { state: 'closed' });

      expect(namesOf(page)).toEqual(['Étude de la facturation SSO', 'Maquette validée']);
      expect(namesOf(page)).toEqual(namesOfRows(assignedTo(theo, 'closed')));
      const hugoClosed = await myTasksOf(hugo, { state: 'closed' });
      expect(namesOf(hugoClosed)).toEqual(['Exporter les tâches en CSV', 'Rédiger la newsletter']);
    });

    it('opens on the "open" tab, and counts both tabs on every page', async () => {
      const page = await myTasksOf(theo);
      const closed = await myTasksOf(theo, { state: 'closed' });

      expect(page.counts).toEqual({ open: 10, closed: 2 });
      expect(closed.counts).toEqual({ open: 10, closed: 2 });
    });

    it('pages with the cursor, three at a time, with the counts of both tabs on each page', async () => {
      const pages = await walk((cursor) => myTasksOf(theo, { limit: 3, cursor }));

      expect(pages.map((page) => page.items.length)).toEqual([3, 3, 3, 1]);
      expect(pages.flatMap((page) => namesOf(page))).toEqual(namesOfRows(assignedTo(theo, 'open')));
      expect(pages.map((page) => page.counts)).toEqual(pages.map(() => ({ open: 10, closed: 2 })));
    });

    it('leaves out the tasks of a private space the caller does not see', async () => {
      const own = await myTasksOf(hugo);
      const others = await myTasksOf(theo);

      expect(namesOf(own)).toContain('Carnet de recherche');
      expect(namesOf(others)).not.toContain('Carnet de recherche');
      expect(namesOf(await myTasksOf(camille))).toContain('Budget 2027');
      expect(namesOf(await myTasksOf(hugo))).not.toContain('Budget 2027');
      expect(own.counts).toEqual({ open: assignedTo(hugo, 'open').length, closed: 2 });
    });

    it('lists the tasks of the other members the same way, whoever they are', async () => {
      for (const person of [camille, hugo, lea]) {
        for (const state of ['open', 'closed'] as const) {
          expect(namesOf(await myTasksOf(person, { state }))).toEqual(
            namesOfRows(assignedTo(person, state)),
          );
        }
      }
    });

    it('answers an empty page and zero counts to a guest and to a member with no task', async () => {
      const empty = { items: [], nextCursor: null, counts: { open: 0, closed: 0 } };

      expect(await myTasksOf(nadia)).toEqual(empty);
      expect(await myTasksOf(nadia, { state: 'closed' })).toEqual(empty);
      expect(
        await read(
          ListMyTasksInternalResponse,
          `/internal/v1/users/${solene.userId}/tasks`,
          solene,
          {},
          { organizationId: atelierDeltaId },
        ),
      ).toEqual(empty);
    });

    it('answers 404 user.not-found to a request for the tasks of another account', async () => {
      expectProblem(
        await refused(`/internal/v1/users/${hugo.userId}/tasks`, camille),
        404,
        'user.not-found',
      );
      expectProblem(
        await refused(`/internal/v1/users/${randomUUID()}/tasks`, camille),
        404,
        'user.not-found',
      );
    });

    it('reads the account in either case, as the actor', async () => {
      const response = await send(
        'get',
        `/internal/v1/users/${theo.userId.toUpperCase()}/tasks`,
        theo,
      );

      expectStatus(response, 200);
      expect(namesOf(conforms(ListMyTasksInternalResponse, bodyOf(response)))).toEqual(
        namesOfRows(assignedTo(theo, 'open')),
      );
    });
  });

  describe('"Accueil" shows the counters of the caller, the next seven tasks, the current sprints and the first six lists', () => {
    it('counts the assigned tasks, subtasks included: not closed, late, due today and done', async () => {
      const home = await homeOf(theo);

      expect(home.stats).toEqual({ assigned: 10, late: 1, dueToday: 3, done: 2 });
    });

    it('counts the stats from the tasks assigned to the caller in the spaces they see only', async () => {
      const hugoHome = await homeOf(hugo);
      const camilleHome = await homeOf(camille);

      const hugoOpen = assignedTo(hugo, 'open');
      expect(hugoHome.stats).toEqual({
        assigned: hugoOpen.length,
        late: hugoOpen.filter((row) => row.due !== null && row.due < today).length,
        dueToday: hugoOpen.filter((row) => row.due === today).length,
        done: assignedTo(hugo, 'closed').filter((row) => row.status === 'done').length,
      });
      expect(camilleHome.stats.assigned).toBe(assignedTo(camille, 'open').length);
    });

    it('moves the counters with the date of the caller', async () => {
      expect((await homeOf(theo, '2026-11-07')).stats).toMatchObject({ late: 0, dueToday: 1 });
      expect((await homeOf(theo, '2026-11-09')).stats).toMatchObject({ late: 4, dueToday: 1 });
    });

    it('lists the seven next open tasks, by due date, the undated last', async () => {
      const home = await homeOf(theo);

      expect(home.priorities.map((task) => task.name)).toEqual(
        namesOfRows(assignedTo(theo, 'open').slice(0, 7)),
      );
      expect(home.priorities.map((task) => task.name)).toEqual([
        'Axe des ordonnées',
        'Écran des événements à venir',
        'Sécurité des sessions',
        'Jeu de données',
        'Notifications par courriel',
        'Page des quotas d’organisation',
        'Préparer la démo',
      ]);
    });

    it('lists the ten current sprints with the earliest end first, the one created first on a tie, and counts Sprint 14 as the mockup does', async () => {
      const home = await homeOf(theo);

      const expected = sprints
        .map((sprint, index) => ({ ...sprint, index }))
        .filter((sprint) => sprint.start <= today && today <= sprint.end)
        .sort((left, right) => byCodePoint(left.end, right.end) || left.index - right.index)
        .slice(0, 10)
        .map((sprint) => sprint.name);
      expect(home.sprints.map((summary) => summary.list.name)).toEqual(expected);
      expect(home.sprints).toHaveLength(10);
      expect(home.sprints.map((summary) => summary.list.name)).toEqual([
        'Sprint du jour',
        'Sprint 9 nov.',
        'Sprint 10 nov.',
        'Sprint 11 nov.',
        'Sprint 12 nov.',
        'Sprint 13 nov.',
        'Sprint 14 nov.',
        'Sprint 15 nov.',
        'Sprint 16 nov.',
        'Sprint 14',
      ]);
      const sprint14Summary = home.sprints.find((summary) => summary.list.id === sprint14.id);
      expect(sprint14Summary?.counts).toEqual(sprint14Counts);
      expect(
        home.sprints
          .filter((summary) => summary.list.id !== sprint14.id)
          .every((summary) => summary.counts.total === 0),
      ).toBe(true);
    });

    it('includes a sprint that starts or ends on the date of the caller, and leaves out one that ended or has not started', async () => {
      const names = (await homeOf(theo)).sprints.map((summary) => summary.list.name);
      const before = (await homeOf(theo, '2026-11-07')).sprints.map((summary) => summary.list.name);
      const after = (await homeOf(theo, '2026-11-18')).sprints.map((summary) => summary.list.name);

      expect(names).toContain('Sprint du jour');
      expect(names).not.toContain('Sprint 12');
      expect(names).not.toContain('Sprint 16');
      expect(before).toContain('Sprint 12');
      expect(before).not.toContain('Sprint du jour');
      expect(after).toContain('Sprint 16');
      expect(after).not.toContain('Sprint du jour');
    });

    it('lists the first six lists in the order of the sidebar, with the counters of their top-level tasks', async () => {
      const home = await homeOf(theo);

      expect(home.lists.map((summary) => summary.list.name)).toEqual([
        'Première liste',
        'Backlog produit',
        'Sprint 14',
        'Première liste',
        'Sprint 15',
        'Première liste',
      ]);
      expect(home.lists.map((summary) => summary.list.spaceId)).toEqual([
        produit.id,
        produit.id,
        produit.id,
        marketing.id,
        marketing.id,
        sprintsSpace.id,
      ]);
      expect(home.lists.map((summary) => summary.counts)).toEqual([
        noCounts,
        countsOf(rowsOf('backlog'), today),
        sprint14Counts,
        { total: 3, open: 2, done: 1, cancelled: 0, late: 1 },
        noCounts,
        noCounts,
      ]);
    });

    it('counts the top-level tasks only in the lists, while the stats count the subtasks too', async () => {
      const home = await homeOf(theo);

      const backlogSummary = home.lists.find((summary) => summary.list.id === backlog.id);
      expect(backlogSummary?.counts.total).toBe(20);
      expect(home.stats.assigned).toBe(assignedTo(theo, 'open').length);
      expect(assignedTo(theo, 'open').some((row) => row.parent !== undefined)).toBe(true);
    });

    it('puts the private list of its owner in the sixth place of the sidebar, and no one else’s', async () => {
      const hugoHome = await homeOf(hugo);
      const camilleHome = await homeOf(camille);

      expect(hugoHome.lists.at(-1)?.list.id).toBe(rechercheList.id);
      expect(hugoHome.lists.at(-1)?.counts).toEqual({
        total: 1,
        open: 1,
        done: 0,
        cancelled: 0,
        late: 1,
      });
      expect(camilleHome.lists.at(-1)?.list.id).toBe(directionList.id);
      expect(camilleHome.lists.at(-1)?.counts).toEqual({
        total: 1,
        open: 1,
        done: 0,
        cancelled: 0,
        late: 0,
      });
      expect((await homeOf(theo)).lists.at(-1)?.list.id).toBe(sprintsFirstList.id);
    });

    it('answers zeros and empty lists to a guest', async () => {
      expect(await homeOf(nadia)).toEqual({
        stats: { assigned: 0, late: 0, dueToday: 0, done: 0 },
        priorities: [],
        sprints: [],
        lists: [],
      });
    });

    it('answers 404 user.not-found to the home of another account', async () => {
      expectProblem(
        await refused(`/internal/v1/users/${hugo.userId}/home`, camille, { today }),
        404,
        'user.not-found',
      );
    });
  });

  // #endregion

  // #region Refusals and malformed requests

  /** A route of the seven, with the path and the query a given caller sends. */
  interface QueryRoute {
    readonly name: string;
    readonly path: string;
    readonly query: Query;
  }

  /**
   * The seven routes as a caller sends them, each with the parameters it needs.
   *
   * @param person - The caller, whose account is the one of the user routes.
   * @returns The routes.
   */
  function routesOf(person: Person): readonly QueryRoute[] {
    return [
      { name: 'list tasks', path: `/internal/v1/lists/${backlog.id}/tasks`, query: {} },
      {
        name: 'task groups',
        path: `/internal/v1/lists/${backlog.id}/task-groups`,
        query: { groupBy: 'status' },
      },
      { name: 'list counts', path: `/internal/v1/lists/${backlog.id}/counts`, query: { today } },
      {
        name: 'space overview',
        path: `/internal/v1/spaces/${produit.id}/overview`,
        query: { today },
      },
      { name: 'labels', path: '/internal/v1/labels', query: {} },
      { name: 'my tasks', path: `/internal/v1/users/${person.userId}/tasks`, query: {} },
      { name: 'home', path: `/internal/v1/users/${person.userId}/home`, query: { today } },
    ];
  }

  /**
   * Checks that a response refuses a cursor: 400 `request.invalid` with one issue on `cursor`.
   *
   * @param response - A supertest response.
   */
  function expectInvalidCursor(response: request.Response): void {
    expectProblem(response, 400, 'request.invalid');
    expect(bodyOf(response)).toMatchObject({
      details: {
        issues: [
          expect.objectContaining({
            in: 'query',
            path: 'cursor',
            code: 'invalid_cursor',
          }) as unknown,
        ],
      },
    });
  }

  describe('what the caller does not see answers 404, with the code of what was asked', () => {
    it('answers 404 organization.not-found on every route to an account the copy of the memberships does not hold', async () => {
      for (const route of routesOf(stranger)) {
        expectProblem(
          await refused(route.path, stranger, route.query),
          404,
          'organization.not-found',
        );
      }
    });

    it('answers 404 user.not-found before looking at the membership, to a request for another account', async () => {
      expectProblem(
        await refused(`/internal/v1/users/${camille.userId}/tasks`, stranger),
        404,
        'user.not-found',
      );
      expectProblem(
        await refused(`/internal/v1/users/${camille.userId}/home`, stranger, { today }),
        404,
        'user.not-found',
      );
    });

    it('answers 404 list.not-found to a list that does not exist, on the three list routes', async () => {
      const unknown = randomUUID();

      for (const [path, query] of [
        [`/internal/v1/lists/${unknown}/tasks`, {}],
        [`/internal/v1/lists/${unknown}/task-groups`, { groupBy: 'status' }],
        [`/internal/v1/lists/${unknown}/counts`, { today }],
      ] as const) {
        expectProblem(await refused(path, camille, query), 404, 'list.not-found');
      }
    });

    it('answers 404 list.not-found on the list of a private space to everyone but its owner, and answers the owner', async () => {
      for (const viewer of [camille, ines, lea, theo]) {
        for (const [path, query] of [
          [`/internal/v1/lists/${rechercheList.id}/tasks`, {}],
          [`/internal/v1/lists/${rechercheList.id}/task-groups`, { groupBy: 'status' }],
          [`/internal/v1/lists/${rechercheList.id}/counts`, { today }],
        ] as const) {
          expectProblem(await refused(path, viewer, query), 404, 'list.not-found');
        }
      }
      const own = await read(
        ListTasksInternalResponse,
        `/internal/v1/lists/${rechercheList.id}/tasks`,
        hugo,
      );
      expect(namesOf(own)).toEqual(['Carnet de recherche']);
    });

    it('answers 404 list.not-found to a guest on every list, public ones included', async () => {
      for (const listId of [backlog.id, sprint14.id, produitFirstList.id]) {
        for (const [path, query] of [
          [`/internal/v1/lists/${listId}/tasks`, {}],
          [`/internal/v1/lists/${listId}/task-groups`, { groupBy: 'status' }],
          [`/internal/v1/lists/${listId}/counts`, { today }],
        ] as const) {
          expectProblem(await refused(path, nadia, query), 404, 'list.not-found');
        }
      }
    });

    it('reads the identifier of a list in upper case as the same list', async () => {
      const page = await read(
        ListTasksInternalResponse,
        `/internal/v1/lists/${backlog.id.toUpperCase()}/tasks`,
        camille,
        { limit: 2 },
      );

      expect(namesOf(page)).toEqual(namesOfRows(roots().slice(0, 2)));
    });

    it('leaves every task of a private space out of every collection of the others', async () => {
      const hidden = ['Carnet de recherche', 'Budget 2027'];

      const everything = [
        ...namesOf(await listBacklog({ level: 'all' }, theo)),
        ...namesOf(await myTasksOf(theo)),
        ...namesOf(await myTasksOf(theo, { state: 'closed' })),
        ...(await homeOf(theo)).priorities.map((task) => task.name),
      ];
      expect(everything.filter((name) => hidden.includes(name))).toEqual([]);
      const overview = await overviewOf(produit.id, {}, theo);
      expect(overview.taskCount).toBe(118);
      expect((await homeOf(theo)).lists.map((summary) => summary.list.id)).not.toContain(
        rechercheList.id,
      );
      expect((await homeOf(theo)).lists.map((summary) => summary.list.id)).not.toContain(
        directionList.id,
      );
    });
  });

  describe('a malformed request answers 400 request.invalid', () => {
    it('refuses a cursor that is not one, on every route that pages', async () => {
      const paged = routesOf(theo).filter(
        (route) => route.name !== 'list counts' && route.name !== 'home',
      );

      for (const route of paged) {
        expectInvalidCursor(
          await refused(route.path, theo, { ...route.query, cursor: 'not-a-cursor' }),
        );
        expectInvalidCursor(
          await refused(route.path, theo, { ...route.query, cursor: 'a'.repeat(2049) }),
        );
      }
    });

    it('refuses the cursor of another collection on every route that pages', async () => {
      const cursors: Record<string, string | null> = {
        'list tasks': (await listBacklog({ limit: 1 }, theo)).nextCursor,
        'task groups': (await groupsOf({ groupBy: 'status', limit: 1 }, theo)).nextCursor,
        'space overview': (await overviewOf(produit.id, { limit: 1 }, theo)).nextCursor,
        labels: (await labelsOf({ limit: 1 }, theo)).nextCursor,
        'my tasks': (await myTasksOf(theo, { limit: 1 })).nextCursor,
      };
      const paged = routesOf(theo).filter((route) => route.name in cursors);

      for (const route of paged) {
        for (const [owner, cursor] of Object.entries(cursors)) {
          expect(cursor).not.toBeNull();
          const response = await refused(route.path, theo, {
            ...route.query,
            cursor: cursor ?? undefined,
          });
          if (owner === route.name) {
            expectStatus(response, 200);
          } else {
            expectInvalidCursor(response);
          }
        }
      }
    });

    it('refuses a cursor of the same collection once what it pages through has changed', async () => {
      const tasks = (await listBacklog({ limit: 1, sort: 'priority', status: 'todo,progress' }))
        .nextCursor;
      const groups = (await groupsOf({ groupBy: 'assignee', limit: 1 })).nextCursor;
      const overview = (await overviewOf(produit.id, { limit: 1 })).nextCursor;
      const labels = (await labelsOf({ limit: 1, search: 'a' })).nextCursor;
      const mine = (await myTasksOf(theo, { limit: 1 })).nextCursor;
      const base = `/internal/v1/lists/${backlog.id}`;

      expectInvalidCursor(
        await refused(`${base}/tasks`, camille, {
          sort: 'name',
          status: 'todo,progress',
          cursor: tasks ?? undefined,
        }),
      );
      expectInvalidCursor(
        await refused(`${base}/tasks`, camille, {
          sort: 'priority',
          status: 'todo',
          cursor: tasks ?? undefined,
        }),
      );
      expectInvalidCursor(
        await refused(`${base}/tasks`, camille, {
          sort: 'priority',
          status: 'todo,progress',
          level: 'all',
          cursor: tasks ?? undefined,
        }),
      );
      expectInvalidCursor(
        await refused(`/internal/v1/lists/${sprint14.id}/tasks`, camille, {
          sort: 'priority',
          status: 'todo,progress',
          cursor: tasks ?? undefined,
        }),
      );
      expectInvalidCursor(
        await refused(`${base}/task-groups`, camille, {
          groupBy: 'status',
          cursor: groups ?? undefined,
        }),
      );
      expectInvalidCursor(
        await refused(`/internal/v1/spaces/${marketing.id}/overview`, camille, {
          today,
          cursor: overview ?? undefined,
        }),
      );
      expectInvalidCursor(
        await refused('/internal/v1/labels', camille, { search: 'b', cursor: labels ?? undefined }),
      );
      expectInvalidCursor(
        await refused(`/internal/v1/users/${theo.userId}/tasks`, theo, {
          state: 'closed',
          cursor: mine ?? undefined,
        }),
      );
    });

    it('refuses a date in the year 0000, which PostgreSQL cannot store, in today, dueFrom and dueTo', async () => {
      const listId = backlog.id;

      for (const [path, query] of [
        [`/internal/v1/lists/${listId}/counts`, { today: '0000-11-08' }],
        [`/internal/v1/spaces/${produit.id}/overview`, { today: '0000-01-01' }],
        [`/internal/v1/users/${camille.userId}/home`, { today: '0000-12-31' }],
        [`/internal/v1/lists/${listId}/tasks`, { dueFrom: '0000-01-01' }],
        [`/internal/v1/lists/${listId}/tasks`, { dueTo: '0000-12-31' }],
        [`/internal/v1/lists/${listId}/task-groups`, { groupBy: 'status', dueFrom: '0000-06-01' }],
        [`/internal/v1/lists/${listId}/task-groups`, { groupBy: 'status', dueTo: '0000-06-01' }],
      ] as const) {
        expectProblem(await refused(path, camille, query), 400, 'request.invalid');
      }
      expect(
        (
          await read(
            GetListCountsInternalResponse,
            `/internal/v1/lists/${listId}/counts`,
            camille,
            { today: '0001-01-01' },
          )
        ).counts.total,
      ).toBe(20);
    });

    it('refuses a date that is not one, and a missing today', async () => {
      for (const [path, query] of [
        [`/internal/v1/lists/${backlog.id}/counts`, {}],
        [`/internal/v1/lists/${backlog.id}/counts`, { today: '2026-02-30' }],
        [`/internal/v1/lists/${backlog.id}/counts`, { today: '08/11/2026' }],
        [`/internal/v1/spaces/${produit.id}/overview`, {}],
        [`/internal/v1/users/${camille.userId}/home`, {}],
        [`/internal/v1/lists/${backlog.id}/tasks`, { dueFrom: 'demain' }],
      ] as const) {
        expectProblem(await refused(path, camille, query), 400, 'request.invalid');
      }
    });

    it('refuses a parameter the route does not declare, on all seven routes', async () => {
      for (const route of routesOf(camille)) {
        expectProblem(
          await refused(route.path, camille, { ...route.query, colour: 'violet' }),
          400,
          'request.invalid',
        );
      }
    });

    it('refuses values that are not of the contract: statuses, priorities, assignees, labels, texts, levels and sorts', async () => {
      const path = `/internal/v1/lists/${backlog.id}/tasks`;

      for (const query of [
        { status: 'doing' },
        { status: 'todo,' },
        { priority: 'critique' },
        { assignee: 'everyone' },
        { assignee: Array.from({ length: 21 }, () => 'me').join(',') },
        { label: 'x'.repeat(33) },
        { search: '' },
        { search: 'x'.repeat(101) },
        { level: 'deep' },
        { sort: 'owner' },
        { sort: '--name' },
        { limit: 'ten' },
      ]) {
        expectProblem(await refused(path, camille, query), 400, 'request.invalid');
      }
      for (const query of [{ state: 'archived' }, { limit: 0 }, { limit: 101 }]) {
        expectProblem(
          await refused(`/internal/v1/users/${camille.userId}/tasks`, camille, query),
          400,
          'request.invalid',
        );
      }
    });

    it('refuses an identifier in a path that is not a UUID', async () => {
      for (const path of [
        '/internal/v1/lists/not-a-uuid/tasks',
        '/internal/v1/lists/not-a-uuid/task-groups',
        '/internal/v1/lists/not-a-uuid/counts',
        '/internal/v1/spaces/not-a-uuid/overview',
        '/internal/v1/users/not-a-uuid/tasks',
        '/internal/v1/users/not-a-uuid/home',
      ]) {
        expectProblem(
          await refused(path, camille, { today, groupBy: 'status' }),
          400,
          'request.invalid',
        );
      }
    });

    it('refuses a text holding U+0000, which PostgreSQL cannot store, in a filter', async () => {
      for (const query of [{ search: 'a\u0000b' }, { label: 'a\u0000b' }]) {
        expectProblem(
          await refused(`/internal/v1/lists/${backlog.id}/tasks`, camille, query),
          400,
          'request.invalid',
        );
      }
      expectProblem(
        await refused('/internal/v1/labels', camille, { search: 'a\u0000b' }),
        400,
        'request.invalid',
      );
    });
  });

  // #endregion

  // #region Isolation of the organizations

  describe('organizations never see each other: no list, no task, no label, no count crosses', () => {
    let deltaList: ListBody;
    let deltaSpace: SpaceBody;

    beforeAll(async () => {
      const created = await createSpace(
        solene,
        { name: 'Studio Delta', prefix: 'DLT' },
        atelierDeltaId,
      );
      deltaSpace = created.space;
      deltaList = created.firstList;
      for (const body of [
        {
          name: 'Refondre le catalogue',
          labels: ['Delta seul', 'Auth'],
          assigneeIds: [solene.userId],
        },
        { name: 'Écrire la FAQ', labels: ['Delta seul'], priority: 'haute' },
      ]) {
        const response = await send('post', `/internal/v1/lists/${deltaList.id}/tasks`, solene, {
          body,
          organizationId: atelierDeltaId,
        });
        expectStatus(response, 201);
      }
    });

    it('answers its own tasks, groups, counters, overview, labels, tasks and home to the owner of the other organization', async () => {
      const options = { organizationId: atelierDeltaId };

      const page = await read(
        ListTasksInternalResponse,
        `/internal/v1/lists/${deltaList.id}/tasks`,
        solene,
        {},
        options,
      );
      const counts = await read(
        GetListCountsInternalResponse,
        `/internal/v1/lists/${deltaList.id}/counts`,
        solene,
        { today },
        options,
      );
      const overview = await read(
        GetSpaceOverviewInternalResponse,
        `/internal/v1/spaces/${deltaSpace.id}/overview`,
        solene,
        { today },
        options,
      );
      const labels = await read(
        ListLabelsInternalResponse,
        '/internal/v1/labels',
        solene,
        {},
        options,
      );
      const mine = await read(
        ListMyTasksInternalResponse,
        `/internal/v1/users/${solene.userId}/tasks`,
        solene,
        {},
        options,
      );
      const home = await read(
        GetHomeInternalResponse,
        `/internal/v1/users/${solene.userId}/home`,
        solene,
        { today },
        options,
      );

      expect(namesOf(page)).toEqual(['Refondre le catalogue', 'Écrire la FAQ']);
      expect(counts.counts).toEqual({ total: 2, open: 2, done: 0, cancelled: 0, late: 0 });
      expect(overview).toMatchObject({ listCount: 1, taskCount: 2 });
      expect(labels.items).toEqual([{ name: 'Auth' }, { name: 'Delta seul' }]);
      expect(namesOf(mine)).toEqual(['Refondre le catalogue']);
      expect(home.stats.assigned).toBe(1);
      expect(home.lists.map((summary) => summary.list.spaceId)).toEqual([deltaSpace.id]);
    });

    it('answers 404 for a list and a space of the other organization, on every route that names one', async () => {
      for (const [path, query, code] of [
        [`/internal/v1/lists/${deltaList.id}/tasks`, {}, 'list.not-found'],
        [`/internal/v1/lists/${deltaList.id}/task-groups`, { groupBy: 'status' }, 'list.not-found'],
        [`/internal/v1/lists/${deltaList.id}/counts`, { today }, 'list.not-found'],
        [`/internal/v1/spaces/${deltaSpace.id}/overview`, { today }, 'space.not-found'],
      ] as const) {
        expectProblem(await refused(path, camille, query), 404, code);
      }
      for (const [path, query, code] of [
        [`/internal/v1/lists/${backlog.id}/tasks`, {}, 'list.not-found'],
        [`/internal/v1/lists/${backlog.id}/task-groups`, { groupBy: 'status' }, 'list.not-found'],
        [`/internal/v1/lists/${backlog.id}/counts`, { today }, 'list.not-found'],
        [`/internal/v1/spaces/${produit.id}/overview`, { today }, 'space.not-found'],
      ] as const) {
        expectProblem(
          await refused(path, solene, query, { organizationId: atelierDeltaId }),
          404,
          code,
        );
      }
    });

    it('lists no label, no task and no count of the other organization', async () => {
      const names = (await labelsOf()).items.map((label) => label.name);

      expect(names).not.toContain('Delta seul');
      expect((await countsOfList(backlog.id)).counts.total).toBe(20);
      expect((await homeOf(camille)).lists.map((summary) => summary.list.spaceId)).not.toContain(
        deltaSpace.id,
      );
    });

    it('lets the application role read only the rows of the organization of its transaction, whatever the statement names', async () => {
      const filter: TaskFilter = {
        statuses: null,
        priorities: null,
        assignees: null,
        labelKeys: null,
        search: null,
        dueFrom: null,
        dueTo: null,
        rootsOnly: false,
      };
      const order: TaskOrder = { key: 'manual', descending: false };
      const visible = await listsOf([produit.id, marketing.id, deltaSpace.id]);
      const run = async (statement: SQL, organizationId: string): Promise<readonly unknown[]> => {
        const query = new PgDialect().sqlToQuery(statement);
        return inTenant(
          organizationId,
          async (client) => (await client.query(query.sql, query.params)).rows,
        );
      };

      // As Delta, the statements that name Atelier Nord find nothing.
      expect(
        await run(
          pageStatement(atelierNordId, backlog.id, filter, order, null, 50),
          atelierDeltaId,
        ),
      ).toEqual([]);
      expect(await run(countStatement(atelierNordId, backlog.id, filter), atelierDeltaId)).toEqual([
        { total: 0 },
      ]);
      expect(
        await run(groupStatement(atelierNordId, backlog.id, filter, 'status'), atelierDeltaId),
      ).toEqual([]);
      expect(
        await run(
          countsOfListsStatement(atelierNordId, [backlog.id, sprint14.id], today),
          atelierDeltaId,
        ),
      ).toEqual([]);
      expect(
        await run(labelPageStatement(atelierNordId, visible, null, null, 50), atelierDeltaId),
      ).toEqual([]);
      expect(
        await run(
          assignedPageStatement(atelierNordId, camille.userId, visible, 'open', null, 50),
          atelierDeltaId,
        ),
      ).toEqual([]);
      expect(
        await run(stateCountsStatement(atelierNordId, camille.userId, visible), atelierDeltaId),
      ).toEqual([{ open: 0, closed: 0 }]);
      expect(
        await run(
          homeStatsStatement(atelierNordId, camille.userId, visible, today),
          atelierDeltaId,
        ),
      ).toEqual([{ assigned: 0, late: 0, dueToday: 0, done: 0 }]);
      // As Atelier Nord, the same statements for Delta find nothing either, and an unqualified count
      // holds the rows of Atelier Nord alone.
      expect(
        await run(
          pageStatement(atelierDeltaId, deltaList.id, filter, order, null, 50),
          atelierNordId,
        ),
      ).toEqual([]);
      const [own] = await inTenant(
        atelierNordId,
        async (client) => (await client.query('select count(*)::int as total from tasks')).rows,
      );
      const [system] = await asSystem<{ readonly total: number }>(
        'select count(*)::int as total from tasks where organization_id = $1',
        [atelierNordId],
      );
      expect(own).toEqual({ total: system?.total });
    });
  });

  // #endregion

  // #region Statements per route

  /**
   * The statements a call sends to PostgreSQL on the connections of the application, without the
   * control of the transaction (`begin`, `commit`, the settings of the tenant) and without the relay
   * of the outbox, which runs on its own schedule.
   *
   * @param call - The request.
   * @returns The statements, in the order they were sent.
   */
  async function statementsOf(call: () => Promise<request.Response>): Promise<string[]> {
    const seen: string[] = [];
    const prototype = pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown };
    const original = prototype.query;
    prototype.query = function (this: unknown, ...args: unknown[]): unknown {
      const first = args[0];
      seen.push(
        typeof first === 'string' ? first : ((first as { text?: string } | undefined)?.text ?? ''),
      );
      return Reflect.apply(original, this, args);
    };
    try {
      expectStatus(await call(), 200);
    } finally {
      prototype.query = original;
    }
    return seen.filter(
      (text) =>
        !/^\s*(begin|commit|rollback|set |select set_config|start transaction)/iu.test(text) &&
        !/outbox_events|pgboss/u.test(text),
    );
  }

  /**
   * Sends the same route with two page sizes and counts the statements of each.
   *
   * @param path - Path of the route.
   * @param query - Its other parameters.
   * @param actor - Who reads.
   * @returns The number of statements with 2 tasks per page and with 100.
   */
  async function statementCounts(
    path: string,
    query: Query,
    actor: Person,
  ): Promise<readonly [number, number]> {
    const narrow = await statementsOf(() =>
      send('get', `${path}${queryOf({ ...query, limit: 2 })}`, actor),
    );
    const wide = await statementsOf(() =>
      send('get', `${path}${queryOf({ ...query, limit: 100 })}`, actor),
    );
    return [narrow.length, wide.length];
  }

  describe('a route sends the same number of statements whatever the size of the page or of the list', () => {
    it('sends a constant number of statements per route, with 2 tasks per page and with 100', async () => {
      const report: string[] = [];
      const routes: readonly QueryRoute[] = [
        ...routesOf(theo).filter((route) => route.name !== 'list counts' && route.name !== 'home'),
        {
          name: 'list tasks, filtered',
          path: `/internal/v1/lists/${backlog.id}/tasks`,
          query: { assignee: 'me,none', label: 'auth', search: 'sso', sort: '-dueDate' },
        },
        {
          name: 'list tasks, level all',
          path: `/internal/v1/lists/${backlog.id}/tasks`,
          query: { level: 'all', sort: 'name' },
        },
        {
          name: 'task groups, assignee',
          path: `/internal/v1/lists/${backlog.id}/task-groups`,
          query: { groupBy: 'assignee' },
        },
      ];

      for (const route of routes) {
        const [narrow, wide] = await statementCounts(route.path, route.query, theo);
        report.push(
          `${route.name}: ${String(narrow)} statements with 2 per page, ${String(wide)} with 100`,
        );
        expect(narrow).toBe(wide);
      }
      const single = [
        { name: 'list counts', path: `/internal/v1/lists/${sprint14.id}/counts`, query: { today } },
        { name: 'home', path: `/internal/v1/users/${theo.userId}/home`, query: { today } },
      ];
      for (const route of single) {
        const statements = await statementsOf(() =>
          send('get', `${route.path}${queryOf(route.query)}`, theo),
        );
        report.push(`${route.name}: ${String(statements.length)} statements`);
      }
      console.info(
        `Statements per route (without the control of the transaction):\n${report.join('\n')}`,
      );
    }, 120_000);
  });

  // #endregion

  // #region Plans and timings

  /** What a plan of PostgreSQL holds that the report keeps. */
  interface PlanNode {
    readonly 'Node Type': string;
    readonly 'Relation Name'?: string;
    readonly 'Index Name'?: string;
    readonly 'Shared Hit Blocks'?: number;
    readonly 'Shared Read Blocks'?: number;
    readonly 'Actual Rows'?: number;
    readonly Plans?: readonly PlanNode[];
  }

  /** The plan of a statement and what it cost. */
  interface PlanReport {
    readonly scope: string;
    readonly label: string;
    readonly nodes: readonly string[];
    readonly scans: readonly string[];
    readonly indexes: readonly string[];
    readonly seqScanOnTasks: boolean;
    readonly blocks: number;
    readonly milliseconds: number;
    readonly rows: number;
  }

  /** A statement to take the plan of. */
  interface Probe {
    readonly scope: string;
    readonly label: string;
    readonly statement: SQL;
    /** Whether a plan on the list of Sprint 14 must be an index range of the list. */
    readonly rangeOfTheList?: boolean;
  }

  const emptyFilter: TaskFilter = {
    statuses: null,
    priorities: null,
    assignees: null,
    labelKeys: null,
    search: null,
    dueFrom: null,
    dueTo: null,
    rootsOnly: true,
  };

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
   * @param probe - The statement the plan is of.
   * @param document - The first member of the JSON the statement returned.
   * @returns What the report keeps.
   */
  function summarize(
    probe: Probe,
    document: { readonly Plan: PlanNode; readonly 'Execution Time': number },
  ): PlanReport {
    const nodes = new Set<string>();
    const scans = new Set<string>();
    const indexes = new Set<string>();
    let seqScanOnTasks = false;
    visitPlan(document.Plan, (node) => {
      nodes.add(node['Node Type']);
      const relation = node['Relation Name'];
      const index = node['Index Name'];
      if (relation !== undefined) {
        scans.add(`${node['Node Type']} ${index ?? relation}`);
      } else if (index !== undefined) {
        scans.add(`${node['Node Type']} ${index}`);
      }
      if (index !== undefined) {
        indexes.add(index);
      }
      if (node['Node Type'].includes('Seq Scan') && relation === 'tasks') {
        seqScanOnTasks = true;
      }
    });
    return {
      scope: probe.scope,
      label: probe.label,
      nodes: [...nodes],
      scans: [...scans],
      indexes: [...indexes],
      seqScanOnTasks,
      blocks:
        (document.Plan['Shared Hit Blocks'] ?? 0) + (document.Plan['Shared Read Blocks'] ?? 0),
      milliseconds: rounded(document['Execution Time']),
      rows: document.Plan['Actual Rows'] ?? 0,
    };
  }

  /**
   * Takes the plan of a statement as the application role, in a tenant transaction of Atelier Nord,
   * after a first execution that warms the cache the way a busy service has it.
   *
   * @param probe - The statement.
   * @param organizationId - The organization of the transaction.
   * @returns The plan.
   */
  async function planOf(probe: Probe, organizationId: string = atelierNordId): Promise<PlanReport> {
    const query = new PgDialect().sqlToQuery(probe.statement);
    const text = `explain (analyze, buffers, format json) ${query.sql}`;
    return inTenant(organizationId, async (client) => {
      await client.query(text, query.params);
      const result = await client.query(text, query.params);
      const [row] = result.rows as {
        readonly 'QUERY PLAN': readonly {
          readonly Plan: PlanNode;
          readonly 'Execution Time': number;
        }[];
      }[];
      const document = row?.['QUERY PLAN'][0];
      if (document === undefined) {
        throw new Error(`No plan for ${probe.label}.`);
      }
      return summarize(probe, document);
    });
  }

  /**
   * Takes the plans of statements in a session of the migrator role that carries the policy of the
   * application role (the organization of the transaction, not the system access), first as the
   * indexes stand and then with indexes dropped inside the same transaction, which is rolled back,
   * to see what the indexes change. Both runs use the same session, so the only difference is the
   * indexes.
   *
   * @param indexNames - The indexes to drop.
   * @param probes - The statements.
   * @returns The plans with the indexes and without them.
   */
  async function plansAround(
    indexNames: readonly string[],
    probes: readonly Probe[],
  ): Promise<{ readonly kept: PlanReport[]; readonly dropped: PlanReport[] }> {
    const client = await migrator.connect();
    const kept: PlanReport[] = [];
    const dropped: PlanReport[] = [];
    const take = async (into: PlanReport[]): Promise<void> => {
      for (const probe of probes) {
        const query = new PgDialect().sqlToQuery(probe.statement);
        const text = `explain (analyze, buffers, format json) ${query.sql}`;
        await client.query(text, query.params);
        const result = await client.query<{
          'QUERY PLAN': { Plan: PlanNode; 'Execution Time': number }[];
        }>(text, query.params);
        const document = result.rows[0]?.['QUERY PLAN'][0];
        if (document !== undefined) {
          into.push(summarize(probe, document));
        }
      }
    };
    try {
      await client.query('begin');
      // The policy of the application role: the organization of the transaction, not the system access.
      await client.query('select set_config($1, $2, true)', ['app.organization_id', atelierNordId]);
      await take(kept);
      for (const indexName of indexNames) {
        await client.query(`drop index ${indexName}`);
      }
      await take(dropped);
    } finally {
      await client.query('rollback');
      client.release();
    }
    return { kept, dropped };
  }

  /**
   * The position of the last task of a first page, to take the plan of the page after it.
   *
   * @param listId - The list.
   * @param filter - The filter of the page.
   * @param order - The order of the page.
   * @returns The position after the fiftieth task.
   */
  async function positionAfterFifty(
    listId: string,
    filter: TaskFilter,
    order: TaskOrder,
  ): Promise<TaskPosition> {
    const query = new PgDialect().sqlToQuery(
      pageStatement(atelierNordId, listId, filter, order, null, 50),
    );
    const result = await inTenant(atelierNordId, (client) => client.query(query.sql, query.params));
    const last = result.rows.at(-1) as
      | {
          readonly id: string;
          readonly createdAt: string;
          readonly sortValue: string | number | null;
        }
      | undefined;
    if (last === undefined) {
      throw new Error('The first page is empty.');
    }
    return { sortValue: last.sortValue, createdAt: new Date(last.createdAt), id: last.id };
  }

  const orders: readonly (readonly [string, TaskOrder])[] = [
    ['manual', { key: 'manual', descending: false }],
    ['-manual', { key: 'manual', descending: true }],
    ['createdAt', { key: 'createdAt', descending: false }],
    ['-createdAt', { key: 'createdAt', descending: true }],
    ['dueDate', { key: 'dueDate', descending: false }],
    ['-dueDate', { key: 'dueDate', descending: true }],
    ['priority', { key: 'priority', descending: false }],
    ['-priority', { key: 'priority', descending: true }],
    ['name', { key: 'name', descending: false }],
    ['-name', { key: 'name', descending: true }],
  ];

  /**
   * The statements of a list, for every order and filter the routes support.
   *
   * @param scope - Name of the list in the report.
   * @param listId - The list.
   * @returns The probes.
   */
  async function probesOfList(scope: string, listId: string, search: string): Promise<Probe[]> {
    const filters: readonly (readonly [string, TaskFilter])[] = [
      ['status', { ...emptyFilter, statuses: ['progress', 'review'] }],
      [
        'assignee me,none',
        { ...emptyFilter, assignees: { userIds: [camille.userId], unassigned: true } },
      ],
      ['label', { ...emptyFilter, labelKeys: ['auth', 'design'] }],
      ['search', { ...emptyFilter, search }],
      ['due range', { ...emptyFilter, dueFrom: '2026-10-10', dueTo: '2026-10-20' }],
      ['level all', { ...emptyFilter, rootsOnly: false }],
    ];
    const probes: Probe[] = [];
    for (const [name, order] of orders) {
      probes.push({
        scope,
        label: `page ${name}`,
        statement: pageStatement(atelierNordId, listId, emptyFilter, order, null, 51),
        rangeOfTheList: true,
      });
    }
    for (const [name, order] of orders.filter(([, entry]) =>
      ['manual', 'dueDate', 'priority', 'name'].includes(entry.key),
    )) {
      const after = await positionAfterFifty(listId, emptyFilter, order);
      probes.push({
        scope,
        label: `page 2 ${name}`,
        statement: pageStatement(atelierNordId, listId, emptyFilter, order, after, 51),
        rangeOfTheList: true,
      });
    }
    for (const [filterName, filter] of filters) {
      for (const orderName of ['manual', '-dueDate', 'name']) {
        const order = orders.find(([name]) => name === orderName)?.[1];
        if (order !== undefined) {
          probes.push({
            scope,
            label: `page ${orderName}, ${filterName}`,
            statement: pageStatement(atelierNordId, listId, filter, order, null, 51),
          });
        }
      }
      probes.push({
        scope,
        label: `total, ${filterName}`,
        statement: countStatement(atelierNordId, listId, filter),
      });
    }
    probes.push({
      scope,
      label: 'total',
      statement: countStatement(atelierNordId, listId, emptyFilter),
      rangeOfTheList: true,
    });
    for (const grouping of [
      'status',
      'priority',
      'assignee',
    ] as const satisfies readonly TaskGrouping[]) {
      probes.push({
        scope,
        label: `groups ${grouping}`,
        statement: groupStatement(atelierNordId, listId, emptyFilter, grouping),
        rangeOfTheList: grouping === 'status',
      });
    }
    probes.push({
      scope,
      label: 'groups assignee, status filter',
      statement: groupStatement(
        atelierNordId,
        listId,
        { ...emptyFilter, statuses: ['progress', 'review'] },
        'assignee',
      ),
    });
    probes.push({
      scope,
      label: 'list counts',
      statement: countsOfListsStatement(atelierNordId, [listId], today),
    });
    return probes;
  }

  /**
   * Inserts by SQL, as an import would, tasks and subtasks into a list with assignees and labels.
   *
   * @param organizationId - The organization.
   * @param spaceId - The space of the list.
   * @param listId - The list.
   * @param prefix - The prefix of the space.
   * @param tops - How many top-level tasks.
   * @param subtasks - How many of them get one subtask.
   * @param people - Three accounts that are assigned in turn.
   */
  async function seedBulk(
    organizationId: string,
    spaceId: string,
    listId: string,
    prefix: string,
    tops: number,
    subtasks: number,
    people: readonly [string, string, string],
  ): Promise<void> {
    const [counter] = await asSystem<{ readonly last_number: number }>(
      `select last_number from space_prefixes where organization_id = $1 and prefix = $2`,
      [organizationId, prefix],
    );
    const base = counter?.last_number ?? 0;
    const statuses = `(array['triage', 'backlog', 'todo', 'progress', 'review', 'testing', 'waiting', 'blocked', 'done', 'cancelled'])`;
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status,
                          priority, due_date, completed_at, cancel_reason, created_at, created_by_type,
                          created_by_id)
       select $1, $2, $3, $4, $5::int + n,
              case when n % 50 = 0 then 'Refonte SSO ' else 'Tâche ' end || md5(n::text) || ' n°' || n,
              st.status, (array['urgente', 'haute', 'moyenne', 'basse'])[1 + n % 4],
              case when n % 3 = 0 then null else date '2026-10-01' + (n % 90) end,
              case when st.status = 'done' then timestamptz '2026-10-01 08:00+00' + n * interval '1 second' end,
              case when st.status = 'cancelled' then 'duplicate' end,
              timestamptz '2026-09-01 08:00+00' + n * interval '37 seconds', 'user', $6
         from generate_series(1, $7::int) as n
        cross join lateral (select ${statuses}[1 + (n / 5) % 10] as status) as st`,
      [organizationId, spaceId, listId, prefix, base, people[0], tops],
    );
    if (subtasks > 0) {
      await asSystem(
        `insert into tasks (organization_id, space_id, list_id, parent_id, key_prefix, key_number, name,
                            status, priority, due_date, completed_at, cancel_reason, created_at,
                            created_by_type, created_by_id)
         select p.organization_id, p.space_id, p.list_id, p.id, p.key_prefix, p.key_number + $6::int,
                'Sous-tâche de ' || p.name, st.status, 'moyenne',
                case when p.key_number % 4 = 0 then null else date '2026-10-15' + (p.key_number % 60) end,
                case when st.status = 'done' then timestamptz '2026-10-02 08:00+00' end,
                case when st.status = 'cancelled' then 'obsolete' end,
                p.created_at + interval '1 second', 'user', $7
           from tasks p
          cross join lateral (select ${statuses}[1 + (p.key_number * 3) % 10] as status) as st
          where p.organization_id = $1 and p.list_id = $2 and p.parent_id is null
            and p.key_number - $3::int <= $4::int and p.key_prefix = $5`,
        [organizationId, listId, base, subtasks, prefix, tops, people[0]],
      );
    }
    await asSystem(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       select t.organization_id, t.id, $4::uuid, 0 from tasks t
        where t.organization_id = $1 and t.list_id = $2 and t.key_number > $3::int and (t.key_number - $3::int) % 5 = 0
       union all
       select t.organization_id, t.id, $5::uuid, 0 from tasks t
        where t.organization_id = $1 and t.list_id = $2 and t.key_number > $3::int and (t.key_number - $3::int) % 5 = 1
       union all
       select t.organization_id, t.id, $6::uuid, 1 from tasks t
        where t.organization_id = $1 and t.list_id = $2 and t.key_number > $3::int and (t.key_number - $3::int) % 10 = 1
       union all
       select t.organization_id, t.id, $6::uuid, 0 from tasks t
        where t.organization_id = $1 and t.list_id = $2 and t.key_number > $3::int and (t.key_number - $3::int) % 5 = 2`,
      [organizationId, listId, base, ...people],
    );
    const values = mockupLabels
      .map(([key, name], index) => `(${String(index)}, '${key}', '${name}')`)
      .join(', ');
    await asSystem(
      `insert into task_labels (organization_id, task_id, label_key, name, position)
       select t.organization_id, t.id, l.label_key, l.name, 0
         from tasks t join (values ${values}) as l(i, label_key, name) on l.i = ((t.key_number - $3::int) / 7) % 10
        where t.organization_id = $1 and t.list_id = $2 and t.key_number > $3::int and (t.key_number - $3::int) % 5 < 3
       union all
       select t.organization_id, t.id, l.label_key, l.name, 1
         from tasks t join (values ${values}) as l(i, label_key, name) on l.i = (((t.key_number - $3::int) / 7) + 4) % 10
        where t.organization_id = $1 and t.list_id = $2 and t.key_number > $3::int and (t.key_number - $3::int) % 4 = 0
          and (t.key_number - $3::int) % 5 < 3`,
      [organizationId, listId, base],
    );
    await asSystem(
      `update space_prefixes set last_number = $3 where organization_id = $1 and prefix = $2`,
      [organizationId, prefix, base + tops + subtasks],
    );
  }

  describe('the queries stay on an index and under their bounds on 75,000 tasks', () => {
    let bigSpace: SpaceBody;
    let bigList: ListBody;
    let siblingList: ListBody;
    let tasksBlocks = 0;
    const plans: PlanReport[] = [];

    beforeAll(async () => {
      const created = await createSpace(camille, { name: 'Import massif', prefix: 'BLK' });
      bigSpace = created.space;
      bigList = created.firstList;
      siblingList = await createList(camille, bigSpace.id, { name: 'Import de l’an dernier' });
      // 20,000 top-level tasks and 5,000 subtasks in one list, 25,000 in a sibling list of the
      // same space and 25,000 in the other organization: the list is a minority of the table.
      await seedBulk(atelierNordId, bigSpace.id, bigList.id, 'BLK', 20_000, 5_000, [
        camille.userId,
        hugo.userId,
        theo.userId,
      ]);
      await seedBulk(atelierNordId, bigSpace.id, siblingList.id, 'BLK', 25_000, 0, [
        camille.userId,
        hugo.userId,
        theo.userId,
      ]);
      const [deltaSpace] = await asSystem<{ readonly id: string }>(
        `select id from spaces where organization_id = $1`,
        [atelierDeltaId],
      );
      const [deltaList] = await asSystem<{ readonly id: string }>(
        `select id from lists where organization_id = $1`,
        [atelierDeltaId],
      );
      if (deltaSpace === undefined || deltaList === undefined) {
        throw new Error('The space of the second organization is missing.');
      }
      await seedBulk(atelierDeltaId, deltaSpace.id, deltaList.id, 'DLT', 25_000, 0, [
        solene.userId,
        randomUUID(),
        randomUUID(),
      ]);
      // The statistics an autovacuum would have gathered after such an import.
      await migrator.query('analyze tasks');
      await migrator.query('analyze task_assignees');
      await migrator.query('analyze task_labels');
      const [size] = (
        await migrator.query<{ readonly blocks: number }>(
          `select (pg_relation_size('tasks') / 8192)::int as blocks`,
        )
      ).rows;
      tasksBlocks = size?.blocks ?? 0;
    }, 600_000);

    it('holds the data the plans are taken on', async () => {
      const [shape] = await asSystem<{
        readonly list_roots: number;
        readonly list_subtasks: number;
        readonly sibling: number;
        readonly delta: number;
        readonly sprint14: number;
        readonly camille: number;
      }>(
        `select (select count(*)::int from tasks where list_id = $2 and parent_id is null) as list_roots,
                (select count(*)::int from tasks where list_id = $2 and parent_id is not null) as list_subtasks,
                (select count(*)::int from tasks where list_id = $3) as sibling,
                (select count(*)::int from tasks where organization_id = $4) as delta,
                (select count(*)::int from tasks where list_id = $5) as sprint14,
                (select count(*)::int from task_assignees where organization_id = $1 and user_id = $6) as camille`,
        [atelierNordId, bigList.id, siblingList.id, atelierDeltaId, sprint14.id, camille.userId],
      );

      expect(shape).toMatchObject({
        list_roots: 20_000,
        list_subtasks: 5_000,
        sibling: 25_000,
        sprint14: 98 + 150,
      });
      expect(shape?.delta).toBeGreaterThanOrEqual(25_000);
      expect(shape?.camille).toBeGreaterThan(5_000);
      console.info(
        `Seeded data: tasks table of ${String(tasksBlocks)} blocks of 8 kB; Camille is assigned to ${String(shape?.camille)} tasks.`,
      );
    });

    it('serves every page, total and status group of Sprint 14 from a range of the index of its list, the other lists being 75,000 tasks', async () => {
      const probes = await probesOfList('Sprint 14', sprint14.id, 'sprint 5');

      for (const probe of probes) {
        plans.push(await planOf(probe));
      }

      const guarded = plans.filter((plan) =>
        probes.some(
          (probe) =>
            probe.rangeOfTheList === true &&
            probe.label === plan.label &&
            probe.scope === plan.scope,
        ),
      );
      expect(guarded.length).toBeGreaterThanOrEqual(16);
      for (const plan of guarded) {
        expect(
          plan.seqScanOnTasks,
          `${plan.label} reads every task: ${plan.scans.join(', ')}`,
        ).toBe(false);
        expect(plan.scans.join(' '), plan.label).toContain('tasks_list_created_index');
        expect(
          plan.blocks,
          `${plan.label} reads ${String(plan.blocks)} of ${String(tasksBlocks)} blocks`,
        ).toBeLessThan(tasksBlocks * 0.02);
        expect(plan.milliseconds, plan.label).toBeLessThan(300);
      }
      for (const plan of plans) {
        expect(plan.seqScanOnTasks, `${plan.label}: ${plan.scans.join(', ')}`).toBe(false);
      }
    }, 300_000);

    it('takes the plans of the large list and of the other statements of the routes, and keeps them for the report', async () => {
      const probes = await probesOfList('Import 20,000', bigList.id, 'sso');
      const visible = await listsOf([produit.id, marketing.id, sprintsSpace.id, bigSpace.id]);
      const lists = [produitFirstList.id, backlog.id, sprint14.id, bigList.id, siblingList.id];
      const own: Probe[] = [
        {
          scope: 'Overview',
          label: 'counts of the lists of Produit',
          statement: countsOfListsStatement(
            atelierNordId,
            [produitFirstList.id, backlog.id, sprint14.id],
            today,
          ),
        },
        {
          scope: 'Home',
          label: 'counts of the first six lists and the ten sprints',
          statement: countsOfListsStatement(
            atelierNordId,
            [
              produitFirstList.id,
              backlog.id,
              sprint14.id,
              marketingFirstList.id,
              sprintsFirstList.id,
              ...[...sprintLists.values()].map((list) => list.id),
            ],
            today,
          ),
        },
        {
          scope: 'Overview',
          label: 'counts of every list of the space',
          statement: countsOfListsStatement(atelierNordId, [bigList.id, siblingList.id], today),
        },
        {
          scope: 'Home',
          label: 'counts of the sprints and the first lists',
          statement: countsOfListsStatement(atelierNordId, lists, today),
        },
        {
          scope: 'Labels',
          label: 'page of labels',
          statement: labelPageStatement(atelierNordId, visible, null, null, 51),
        },
        {
          scope: 'Labels',
          label: 'page of labels, search',
          statement: labelPageStatement(atelierNordId, visible, 'auth', null, 51),
        },
        {
          scope: 'Labels',
          label: 'page 2 of labels',
          statement: labelPageStatement(
            atelierNordId,
            visible,
            null,
            { sortKey: 'contenu', labelKey: 'contenu' },
            51,
          ),
        },
        {
          scope: 'My tasks',
          label: 'page open',
          statement: assignedPageStatement(
            atelierNordId,
            camille.userId,
            visible,
            'open',
            null,
            51,
          ),
        },
        {
          scope: 'My tasks',
          label: 'page closed',
          statement: assignedPageStatement(
            atelierNordId,
            camille.userId,
            visible,
            'closed',
            null,
            51,
          ),
        },
        {
          scope: 'My tasks',
          label: 'counts of both tabs',
          statement: stateCountsStatement(atelierNordId, camille.userId, visible),
        },
        {
          scope: 'Home',
          label: 'stats',
          statement: homeStatsStatement(atelierNordId, camille.userId, visible, today),
        },
        {
          scope: 'Home',
          label: 'seven next tasks',
          statement: assignedPageStatement(atelierNordId, camille.userId, visible, 'open', null, 7),
        },
      ];

      for (const probe of [...probes, ...own]) {
        plans.push(await planOf(probe));
      }

      expect(plans.length).toBeGreaterThan(100);
      // The counters of the lists a space or "Accueil" shows are ranges of the lists, not a scan of
      // the table, whatever the size of the other lists.
      for (const label of [
        'counts of the lists of Produit',
        'counts of the first six lists and the ten sprints',
      ]) {
        const plan = plans.find((entry) => entry.label === label);
        expect(plan?.seqScanOnTasks, `${label}: ${plan?.scans.join(', ') ?? 'no plan'}`).toBe(
          false,
        );
      }
    }, 300_000);

    it('measures what the two indexes change, by dropping each inside a transaction that is rolled back', async () => {
      const visible = await listsOf([produit.id, marketing.id, sprintsSpace.id, bigSpace.id]);
      const probes: Probe[] = [
        {
          scope: 'Sprint 14',
          label: 'page manual',
          statement: pageStatement(
            atelierNordId,
            sprint14.id,
            emptyFilter,
            { key: 'manual', descending: false },
            null,
            51,
          ),
        },
        {
          scope: 'Sprint 14',
          label: 'total',
          statement: countStatement(atelierNordId, sprint14.id, emptyFilter),
        },
        {
          scope: 'Sprint 14',
          label: 'groups status',
          statement: groupStatement(atelierNordId, sprint14.id, emptyFilter, 'status'),
        },
        {
          scope: 'Sprint 14',
          label: 'list counts',
          statement: countsOfListsStatement(atelierNordId, [sprint14.id], today),
        },
        {
          scope: 'Import 20,000',
          label: 'page manual',
          statement: pageStatement(
            atelierNordId,
            bigList.id,
            emptyFilter,
            { key: 'manual', descending: false },
            null,
            51,
          ),
        },
        {
          scope: 'Import 20,000',
          label: 'page dueDate',
          statement: pageStatement(
            atelierNordId,
            bigList.id,
            emptyFilter,
            { key: 'dueDate', descending: false },
            null,
            51,
          ),
        },
        {
          scope: 'Import 20,000',
          label: 'total',
          statement: countStatement(atelierNordId, bigList.id, emptyFilter),
        },
        {
          scope: 'Import 20,000',
          label: 'groups status',
          statement: groupStatement(atelierNordId, bigList.id, emptyFilter, 'status'),
        },
        {
          scope: 'Import 20,000',
          label: 'list counts',
          statement: countsOfListsStatement(atelierNordId, [bigList.id], today),
        },
      ];
      const labelProbes: Probe[] = [
        {
          scope: 'Sprint 14',
          label: 'page manual, label',
          statement: pageStatement(
            atelierNordId,
            sprint14.id,
            { ...emptyFilter, labelKeys: ['auth', 'design'] },
            { key: 'manual', descending: false },
            null,
            51,
          ),
        },
        {
          scope: 'Import 20,000',
          label: 'page manual, label',
          statement: pageStatement(
            atelierNordId,
            bigList.id,
            { ...emptyFilter, labelKeys: ['auth', 'design'] },
            { key: 'manual', descending: false },
            null,
            51,
          ),
        },
        {
          scope: 'Import 20,000',
          label: 'total, label',
          statement: countStatement(atelierNordId, bigList.id, {
            ...emptyFilter,
            labelKeys: ['auth', 'design'],
          }),
        },
        {
          scope: 'Labels',
          label: 'page of labels',
          statement: labelPageStatement(atelierNordId, visible, null, null, 51),
        },
        {
          scope: 'Labels',
          label: 'page of labels, search',
          statement: labelPageStatement(atelierNordId, visible, 'auth', null, 51),
        },
      ];

      const { kept: withList, dropped: withoutList } = await plansAround(
        ['tasks_list_created_index'],
        probes,
      );
      const { kept: withLabels, dropped: withoutLabels } = await plansAround(
        ['task_labels_key_index'],
        labelProbes,
      );

      const line = (name: string, plan: PlanReport | undefined): string =>
        `${name.padEnd(8)} ${(plan?.scans.join(', ') ?? '').padEnd(70)} ${String(plan?.blocks).padStart(6)} blocks ${String(plan?.milliseconds).padStart(8)} ms`;
      const lines = [
        ...probes.flatMap((probe, index) => [
          `${probe.scope} / ${probe.label}`,
          `  ${line('with', withList[index])}`,
          `  ${line('without', withoutList[index])}`,
        ]),
        ...labelProbes.flatMap((probe, index) => [
          `${probe.scope} / ${probe.label} (task_labels_key_index)`,
          `  ${line('with', withLabels[index])}`,
          `  ${line('without', withoutLabels[index])}`,
        ]),
      ];
      console.info(`Plans with and without the index of the migration:\n${lines.join('\n')}`);
      expect(withList).toHaveLength(probes.length);
    }, 300_000);

    it('answers every route of the large list and of Sprint 14 within its bound, whatever the sort, and records the median of five calls', async () => {
      const timings: string[] = [];
      const check = async (
        scope: string,
        label: string,
        path: string,
        query: Query,
        actor: Person,
        bound: number,
      ): Promise<void> => {
        const durations: number[] = [];
        for (let call = 0; call < 5; call += 1) {
          const startedAt = performance.now();
          const response = await send('get', `${path}${queryOf(query)}`, actor);
          durations.push(performance.now() - startedAt);
          expectStatus(response, 200);
        }
        const p50 = rounded(median(durations));
        timings.push(`${scope.padEnd(14)} ${label.padEnd(34)} p50 ${String(p50).padStart(8)} ms`);
        expect(p50, `${scope} ${label}`).toBeLessThan(bound);
      };
      const lists: readonly (readonly [string, string, number, string])[] = [
        ['Sprint 14', sprint14.id, 300, 'sprint 5'],
        ['Import 20,000', bigList.id, 2_000, 'sso'],
      ];

      for (const [scope, listId, bound, search] of lists) {
        const tasksPath = `/internal/v1/lists/${listId}/tasks`;
        await check(scope, 'tasks', tasksPath, {}, camille, bound);
        for (const sort of [
          '-manual',
          'dueDate',
          '-dueDate',
          'priority',
          '-priority',
          'name',
          '-name',
        ]) {
          await check(scope, `tasks sort=${sort}`, tasksPath, { sort }, camille, bound);
        }
        await check(scope, 'tasks level=all', tasksPath, { level: 'all' }, camille, bound);
        await check(
          scope,
          'tasks status',
          tasksPath,
          { status: 'progress,review' },
          camille,
          bound,
        );
        await check(
          scope,
          'tasks assignee=me,none',
          tasksPath,
          { assignee: 'me,none' },
          camille,
          bound,
        );
        await check(scope, 'tasks label', tasksPath, { label: 'auth,design' }, camille, bound);
        await check(scope, `tasks search=${search}`, tasksPath, { search }, camille, bound);
        await check(
          scope,
          'tasks search=SÉCURITÉ',
          tasksPath,
          { search: 'SÉCURITÉ' },
          camille,
          bound,
        );
        await check(
          scope,
          'tasks due range',
          tasksPath,
          { dueFrom: '2026-10-10', dueTo: '2026-10-20' },
          camille,
          bound,
        );
        const first = await read(ListTasksInternalResponse, tasksPath, camille, { sort: 'name' });
        await check(
          scope,
          'tasks page 2 sort=name',
          tasksPath,
          { sort: 'name', cursor: first.nextCursor ?? undefined },
          camille,
          bound,
        );
        for (const groupBy of ['status', 'priority', 'assignee']) {
          await check(
            scope,
            `groups ${groupBy}`,
            `/internal/v1/lists/${listId}/task-groups`,
            { groupBy },
            camille,
            bound,
          );
        }
        await check(
          scope,
          'counts',
          `/internal/v1/lists/${listId}/counts`,
          { today },
          camille,
          bound,
        );
      }
      await check(
        'Overview',
        'Produit',
        `/internal/v1/spaces/${produit.id}/overview`,
        { today },
        camille,
        300,
      );
      await check(
        'Overview',
        'Import massif',
        `/internal/v1/spaces/${bigSpace.id}/overview`,
        { today },
        camille,
        2_000,
      );
      await check('Labels', 'first page', '/internal/v1/labels', {}, camille, 2_000);
      await check(
        'Labels',
        'search=auth',
        '/internal/v1/labels',
        { search: 'auth' },
        camille,
        2_000,
      );
      await check(
        'Labels',
        'search=sécurité',
        '/internal/v1/labels',
        { search: 'sécurité' },
        camille,
        2_000,
      );
      const firstLabels = await read(ListLabelsInternalResponse, '/internal/v1/labels', camille, {
        limit: 3,
      });
      await check(
        'Labels',
        'page 2 of 3',
        '/internal/v1/labels',
        { limit: 3, cursor: firstLabels.nextCursor ?? undefined },
        camille,
        2_000,
      );
      await check(
        'My tasks',
        'open',
        `/internal/v1/users/${camille.userId}/tasks`,
        {},
        camille,
        2_000,
      );
      await check(
        'My tasks',
        'closed',
        `/internal/v1/users/${camille.userId}/tasks`,
        { state: 'closed' },
        camille,
        2_000,
      );
      await check(
        'Home',
        'Camille',
        `/internal/v1/users/${camille.userId}/home`,
        { today },
        camille,
        2_000,
      );
      console.info(`Median of five calls per route, through HTTP:\n${timings.join('\n')}`);
    }, 600_000);

    it('reports the plans of every statement and the use of the indexes', async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1_500);
      });
      const usage = await migrator.query<{
        readonly indexrelname: string;
        readonly idx_scan: string;
      }>(
        `select indexrelname, idx_scan::text from pg_stat_user_indexes
          where relname in ('tasks', 'task_labels', 'task_assignees') order by relname, indexrelname`,
      );
      const table = plans.map(
        (plan) =>
          `${plan.scope.padEnd(14)} ${plan.label.padEnd(36)} ${plan.scans.join(' + ').padEnd(80)} ${plan.seqScanOnTasks ? 'SEQ ' : 'idx '} ${String(plan.blocks).padStart(6)} blk ${String(plan.milliseconds).padStart(8)} ms ${String(plan.rows).padStart(6)} rows`,
      );
      console.info(
        `Plans as task_app (tasks table of ${String(tasksBlocks)} blocks):\n${table.join('\n')}`,
      );
      console.info(
        `Index scans since the start:\n${usage.rows.map((row) => `${row.indexrelname}: ${row.idx_scan}`).join('\n')}`,
      );
      const used = new Set(plans.flatMap((plan) => plan.indexes));
      console.info(`Indexes named by a plan: ${[...used].sort().join(', ')}`);
      expect(used.has('tasks_list_created_index')).toBe(true);
    }, 60_000);
  });

  describe('the fold also ignores the letters NFKD leaves whole, and a search without a letter finds nothing', () => {
    let typographyList: ListBody;
    const names = [
      'Zèbre',
      'Ordre du jour',
      'Œuvre complète',
      'Ours polaire',
      'Opéra',
      'Ødegaard',
      'Æther',
      'Łódź',
      'Đorđe',
    ];
    const longLabel = 'ﷺ'.repeat(32);
    const nearLabel = `${'ﷺ'.repeat(31)}x`;

    beforeAll(async () => {
      const created = await createSpace(camille, { name: 'Typographie', prefix: 'TYP' });
      typographyList = created.firstList;
      for (const [index, name] of names.entries()) {
        const response = await send(
          'post',
          `/internal/v1/lists/${typographyList.id}/tasks`,
          camille,
          {
            body: {
              name,
              priority: 'moyenne',
              status: 'todo',
              labels: index === 2 ? ['Œuvre', longLabel, nearLabel] : [],
            },
          },
        );
        expectStatus(response, 201);
      }
    }, 60_000);

    /**
     * Reads the tasks of the list of the typography space.
     *
     * @param query - The query parameters.
     * @returns The page.
     */
    async function typographyTasks(query: Query = {}): Promise<TaskPageBody> {
      return read(
        ListTasksInternalResponse,
        `/internal/v1/lists/${typographyList.id}/tasks`,
        camille,
        query,
      );
    }

    it('finds "Œuvre" by "oeuvre" and "ŒUVRE", and "Æther", "Łódź", "Đorđe" and "Ødegaard" by their plain letters', async () => {
      expect(namesOf(await typographyTasks({ search: 'oeuvre' }))).toEqual(['Œuvre complète']);
      expect(namesOf(await typographyTasks({ search: 'ŒUVRE' }))).toEqual(['Œuvre complète']);
      expect(namesOf(await typographyTasks({ search: 'aether' }))).toEqual(['Æther']);
      expect(namesOf(await typographyTasks({ search: 'lodz' }))).toEqual(['Łódź']);
      expect(namesOf(await typographyTasks({ search: 'dorde' }))).toEqual(['Đorđe']);
      expect(namesOf(await typographyTasks({ search: 'odegaard' }))).toEqual(['Ødegaard']);
    });

    it('sorts the names by their folded text, "Œuvre" among the o', async () => {
      const expected = [...names].sort((left, right) => byCodePoint(fold(left), fold(right)));

      const ascending = await typographyTasks({ sort: 'name' });
      const descending = await typographyTasks({ sort: '-name' });

      expect(expected.slice(3, 8)).toEqual([
        'Ødegaard',
        'Œuvre complète',
        'Opéra',
        'Ordre du jour',
        'Ours polaire',
      ]);
      expect(namesOf(ascending)).toEqual(expected);
      expect(namesOf(descending)).toEqual([...expected].reverse());
      const pages = await walk((cursor) => typographyTasks({ sort: 'name', limit: 2, cursor }));
      expect(pages.flatMap((page) => namesOf(page))).toEqual(expected);
    });

    it('finds the label "Œuvre" by "oeuvre" on the labels route', async () => {
      const page = await labelsOf({ search: 'oeuvre' });

      expect(page.items.map((label) => label.name)).toEqual(['Œuvre']);
    });

    it('matches nothing for a search that folds to the empty text, for the tasks, the groups and the labels', async () => {
      const marksOnly = '́';

      const tasksPage = await typographyTasks({ search: marksOnly });
      const groups = await read(
        CountTaskGroupsInternalResponse,
        `/internal/v1/lists/${typographyList.id}/task-groups`,
        camille,
        { groupBy: 'status', search: marksOnly },
      );
      const labels = await labelsOf({ search: marksOnly });

      expect(tasksPage).toMatchObject({ items: [], total: 0, nextCursor: null });
      expect(groups.total).toBe(0);
      expect(labels.items).toEqual([]);
    });

    it('pages two labels of 32 × U+FDFA, equal on their first 128 folded code points, with a cursor under the 2048 characters of the kit', async () => {
      const search = 'الله';

      const first = await labelsOf({ search, limit: 1 });
      const cursor = first.nextCursor;
      const second = await labelsOf({ search, limit: 1, cursor: cursor ?? undefined });

      // The key of the second label ends with "x" (U+0078), which comes before U+FDFA by code point.
      expect(first.items.map((label) => label.name)).toEqual([nearLabel]);
      expect(cursor).not.toBeNull();
      expect(cursor?.length).toBeLessThan(2_048);
      expect(second.items.map((label) => label.name)).toEqual([longLabel]);
      expect(second.nextCursor).toBeNull();
    });
  });

  // #endregion
});
