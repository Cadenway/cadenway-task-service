import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { toListRoles } from '../src/modules/spaces/application/mappers/list/list-role.mapper.js';
import type { Viewer } from '../src/modules/spaces/domain/value-objects/member/viewer.value-object.js';
import { DrizzleTaskListRepository } from '../src/modules/spaces/infrastructure/persistence/drizzle/repositories/list/drizzle-task-list.repository.js';
import type { ArchivePosition } from '../src/modules/tasks/application/models/archive/archive-position.model.js';
import type { TaskFilter } from '../src/modules/tasks/application/models/query/task-filter.model.js';
import type { TaskOrder } from '../src/modules/tasks/application/models/query/task-order.model.js';
import type { TaskPosition } from '../src/modules/tasks/application/models/query/task-position.model.js';
import type { MyTaskState } from '../src/modules/tasks/application/models/user/my-task-state.model.js';
import {
  archivedRootsCountStatement,
  archivedRootsPageStatement,
  archiveMemberCountsStatement,
  liveRootCountsStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/archive/archive-statements.mapper.js';
import { assignedPageStatement } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/assignee/assigned-task-statements.mapper.js';
import {
  assignedTasksCondition,
  assignedTasksSource,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/assignee/assigned-task.mapper.js';
import {
  hasStatus,
  isClosed,
  isLateOn,
  isNotClosed,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/count/closed-status.mapper.js';
import {
  countsOfListsStatement,
  homeStatsStatement,
  stateCountsStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/count/task-counts.mapper.js';
import { labelPageStatement } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/label/label-statements.mapper.js';
import { anyOf } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/page/any-of.mapper.js';
import {
  orderTerms,
  sortValueExpression,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/query/task-order.mapper.js';
import { taskPageColumns } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/query/task-page-row.mapper.js';
import {
  countStatement,
  groupStatement,
  pageStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/query/task-query-statements.mapper.js';
import { DrizzleActivityRepository } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/activity/drizzle-activity.repository.js';
import { DrizzleTaskReader } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/task/drizzle-task-reader.repository.js';
import { DrizzleTaskRepository } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/task/drizzle-task.repository.js';
import { DrizzleTaskCollections } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/task/task-collections.repository.js';
import { taskAssignees } from '../src/modules/tasks/infrastructure/persistence/drizzle/schemas/task/task-assignee.schema.js';
import { tasks } from '../src/modules/tasks/infrastructure/persistence/drizzle/schemas/task/task.schema.js';

// The plans of the statements the archives of P3b-1 (PR 2) changed or added, on a disposable
// PostgreSQL started from compose.dev.yaml as a throwaway Compose project on free ports, migrated by
// `src/migrate.ts` as the migrator role, as tests/task-queries.int-spec.ts and
// tests/access.int-spec.ts do. Only PostgreSQL runs: the statements are built by the exported
// builders of `src` or captured from the repositories of `src` through the Drizzle logger, so no
// route, no NATS and no Nest application is needed. Every plan is
// `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` as `task_app` in a tenant transaction of the
// organization (the settings the tenant runner of the kit sets, row-level security forced), after
// a first run that warms the cache, then rolled back.
//
// Atelier Nord holds more than 75,000 tasks: Sprint 14 of the mockup as P3a seeds it (98 top-level
// tasks, 150 subtasks) plus 30 archived tasks, a list of 20,000 tasks whose oldest 30 % are archived,
// and 3,000 lists of 300 spaces with 21 tasks each in trees of three levels, of which one task in
// five is archived (7,500 archives of one to three levels, some rooted at a subtask), 60 of the lists
// archived. The grants of the spaces and lists are those of tests/access.int-spec.ts, plus a view
// on ten private spaces, which give a member a role on about 1,400 lists. Camille is assigned to
// about 10,000 tasks, the member to about 100. A second organization holds 21,000 tasks of its own.
// The plans and timings are printed for the report of the pull request (the minimal reporter of
// Vitest shows the logs of failed tests only: run with `--silent=false` to read them); the
// assertions keep to what is stable: no Seq Scan where an index must serve, the index that serves,
// and generous time bounds.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** The migration of the archives, whose deploy-time cost is measured on the seeded tables. */
const archivesMigration: string = fileURLToPath(
  new URL('../migrations/0006_archives.sql', import.meta.url),
);

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-archive-plans-test-${String(process.pid)}`;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** A second organization, whose rows are the noise of the tables. */
const atelierDeltaId = '01938f6e-0000-7000-8000-000000000002';

/** The date of the caller: the one of the examples of the contract. */
const today = '2026-11-08';

/** Camille Martin (CM), owner of Atelier Nord. */
const camille = { userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24' } as const;

/** Inès Robert (IR), admin of Atelier Nord, assigned to tasks of Sprint 14. */
const ines = { userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c25' } as const;

/** Mathis Roux, member of Atelier Nord, assigned to tasks of Sprint 14. */
const mathis = { userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2a' } as const;

/** Chloé Girard, member of Atelier Nord, assigned to tasks of Sprint 14. */
const chloe = { userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c2d' } as const;

/** Solène Garnier, owner of the second organization. */
const solene = { userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c29' } as const;

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

/** Tasks of a seeded list: 12 top-level, 6 subtasks of the first six, 3 under the first three. */
const TASKS_PER_LIST = 21;

/** Top-level tasks and subtasks of the large list, and how many of its oldest roots are archived. */
const LARGE_LIST = { tops: 16_000, subtasks: 4_000, archivedTops: 4_800 } as const;

/** A filter that keeps every top-level task, as a route without filter asks. */
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

/** The order of "Mes tâches", as `assigned-task-statements.mapper.ts` declares it. */
const assignedOrder: TaskOrder = { key: 'dueDate', descending: false };

/** How much of each a seeded organization holds. */
interface VolumeShape {
  readonly owners: number;
  readonly spaces: number;
  readonly listsPerSpace: number;
  readonly spaceGrants: number;
  readonly listGrants: number;
}

/** A node of a plan of `EXPLAIN (FORMAT JSON)`. */
interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly 'Index Name'?: string;
  readonly 'Shared Hit Blocks'?: number;
  readonly 'Shared Read Blocks'?: number;
  readonly 'Actual Rows'?: number;
  readonly 'Actual Loops'?: number;
  readonly 'Plan Rows'?: number;
  readonly 'Total Cost'?: number;
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
  readonly join: string;
  readonly indexes: readonly string[];
  readonly seqScans: readonly string[];
  /** Rows the scans of each table returned, over all their loops. */
  readonly rowsRead: Readonly<Record<string, number>>;
  /** For each scan, the rows the planner estimated and those it found, per loop. */
  readonly estimates: readonly string[];
  readonly blocks: number;
  readonly milliseconds: number;
  readonly cost: number;
  readonly rows: number;
}

/** A statement the repositories sent, as the Drizzle logger saw it. */
interface CapturedStatement {
  readonly sql: string;
  readonly params: unknown[];
}

/** How a plan is taken. */
interface PlanOptions {
  /** How many of the captured statements to plan, all of them by default. */
  readonly keep?: number;
  /** Planner settings for the transaction (`set local`), to see a plan the planner refused. */
  readonly settings?: readonly string[];
}

/** A shape of the statements of "Mes tâches" and "Accueil". */
type AssignedShape = 'a P3a' | 'b PR 1' | 'c PR 2';

/**
 * The planner settings the plans of "Mes tâches" are compared under: the default, without
 * sequential scans (the index plan the planner refused), and a nested loop that probes
 * `tasks_pkey` once per assignment (sequential and bitmap scans, hash and merge joins off).
 */
const plannerModes: readonly (readonly [string, readonly string[]])[] = [
  ['default', []],
  ['seqscan off', ['enable_seqscan = off']],
  [
    'nested loop',
    [
      'enable_seqscan = off',
      'enable_bitmapscan = off',
      'enable_hashjoin = off',
      'enable_mergejoin = off',
    ],
  ],
];

/** A statement of "Mes tâches" or "Accueil", by name. */
type AssignedProbe = readonly [string, SQL];

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
  const joins: string[] = [];
  const rowsRead: Record<string, number> = {};
  const estimates: string[] = [];
  visitPlan(document.Plan, (node) => {
    const relation = node['Relation Name'];
    const index = node['Index Name'];
    if (relation !== undefined || index !== undefined) {
      estimates.push(
        `${index ?? relation ?? ''} ${String(node['Plan Rows'] ?? 0)}/${String(Math.round(node['Actual Rows'] ?? 0))}`,
      );
    }
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
    if (['Hash Join', 'Nested Loop', 'Merge Join'].includes(node['Node Type'])) {
      joins.push(node['Node Type']);
    }
    if (relation !== undefined) {
      rowsRead[relation] = Math.round(
        (rowsRead[relation] ?? 0) + (node['Actual Rows'] ?? 0) * (node['Actual Loops'] ?? 1),
      );
    }
  });
  return {
    label,
    nodes,
    join: joins.join(' > ') || 'none',
    indexes: [...indexes],
    seqScans,
    rowsRead,
    estimates,
    blocks: (document.Plan['Shared Hit Blocks'] ?? 0) + (document.Plan['Shared Read Blocks'] ?? 0),
    milliseconds: Math.round(document['Execution Time'] * 1000) / 1000,
    cost: Math.round(document.Plan['Total Cost'] ?? 0),
    rows: document.Plan['Actual Rows'] ?? 0,
  };
}

/**
 * The status of a seeded task from an integer expression: two in ten `done`, one `cancelled`, the
 * others spread over the open statuses.
 *
 * @param expression - An integer SQL expression.
 * @returns The SQL `case` expression.
 */
function statusOf(expression: string): string {
  return `case when (${expression}) % 10 in (7, 8) then 'done' when (${expression}) % 10 = 9 then 'cancelled' else (array['todo', 'progress', 'review', 'backlog', 'triage', 'waiting', 'blocked'])[((${expression}) % 7)::int + 1] end`;
}

/**
 * One line of the report for a plan.
 *
 * @param plan - The plan.
 * @returns The line.
 */
function lineOf(plan: PlanLine): string {
  return `archive plan | ${plan.label} | ${plan.nodes.join(' > ')} | indexes ${plan.indexes.join(', ') || 'none'} | ${String(plan.blocks)} shared buffers | ${plan.milliseconds.toFixed(3)} ms | ${String(plan.rows)} rows | scan rows estimated/actual: ${plan.estimates.join(', ')}`;
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

describe('the live condition and the archives keep the statements of the tasks on their indexes', () => {
  let migrator: pg.Pool;
  let application: pg.Pool;

  // What the seed creates and the scenarios read, in the order of the file.
  let produitId = '';
  let sprint14Id = '';
  let largeSpaceId = '';
  let largeListId = '';
  /** The counter of the prefix `CAD` before Sprint 14, as P3a seeds it. */
  const sprint14Base = 481;
  /** The counter of the prefix `BLK` before the large list. */
  const largeBase = 0;
  let tasksBlocks = 0;
  let listRows = 0;
  let listBlocks = 0;
  /** The lists Camille, then the member, has a role on, in the order of the sidebar. */
  let camilleLists: readonly string[] = [];
  let memberLists: readonly string[] = [];
  /** Every plan taken, for the summary at the end. */
  const everyPlan: PlanLine[] = [];

  // The accounts of the volume: the first 300 own the spaces, 300 to 499 receive the grants of
  // spaces, all receive grants of lists (tests/access.int-spec.ts). The member is the 302nd.
  const accounts: readonly string[] = Array.from({ length: 500 }, () => randomUUID());
  const memberId: string = accounts[301] ?? '';
  const asOwner: Viewer = { userId: camille.userId, role: 'owner' };
  const asMember: Viewer = { userId: memberId, role: 'member' };
  const noise: readonly string[] = [
    solene.userId,
    ...Array.from({ length: 199 }, () => randomUUID()),
  ];

  /** The ranked lists of the seeded spaces of an organization, `$1`, as a subquery. */
  const seededLists = `(select li.organization_id, li.id, li.space_id, li.created_at, sp.owner_user_id,
                               row_number() over (order by li.created_at, li.id) - 1 as rank
                          from lists as li
                          join spaces as sp on sp.organization_id = li.organization_id and sp.id = li.space_id
                         where li.organization_id = $1 and sp.name like 'Volume %')`;

  /**
   * Runs a statement as the migrator role with the system access of the policies, since row-level
   * security is forced on its own tables.
   *
   * @param text - The statement.
   * @param params - Its parameters.
   * @returns The rows it returns.
   */
  async function asSystem<TRow extends pg.QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<TRow[]> {
    const client = await migrator.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.system_access', 'on', true)`);
      const result = await client.query<TRow>(text, [...params]);
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
   * Runs work in a tenant transaction of Atelier Nord as `task_app` (the settings the tenant runner
   * of the kit sets: the organization, no system access), then rolls it back.
   *
   * @param work - The work, with the Drizzle database of the transaction and its client.
   * @param settings - Planner settings for the transaction, none by default.
   * @param captured - Receives every statement the work sends, as the Drizzle logger sees it.
   * @returns What the work returns.
   */
  async function inTenant<TResult>(
    work: (db: TransactionDatabase, client: pg.PoolClient) => Promise<TResult>,
    settings: readonly string[] = [],
    captured: CapturedStatement[] = [],
  ): Promise<TResult> {
    const client = await application.connect();
    try {
      await client.query('begin');
      await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
        'app.organization_id',
        atelierNordId,
        'app.system_access',
        'off',
      ]);
      for (const setting of settings) {
        await client.query(`set local ${setting}`);
      }
      const db = drizzle({
        client,
        logger: {
          logQuery: (query: string, params: unknown[]): void => {
            captured.push({ sql: query, params });
          },
        },
      });
      return await work(db, client);
    } finally {
      await client.query('rollback');
      client.release();
    }
  }

  /**
   * Runs work of the repositories in a tenant transaction, records every statement it sends, takes
   * the plan of the first `keep` of them after a first run that warms the cache, then rolls back.
   *
   * @param label - What the work is.
   * @param work - The calls of the repositories, or statements run through `db.execute`.
   * @param options - How many statements to plan, and the planner settings.
   * @returns One line per statement planned.
   */
  async function plansOf(
    label: string,
    work: (db: TransactionDatabase) => Promise<unknown>,
    options: PlanOptions = {},
  ): Promise<PlanLine[]> {
    const captured: CapturedStatement[] = [];
    const keep = options.keep ?? Number.POSITIVE_INFINITY;
    const lines = await inTenant(
      async (db, client) => {
        await work(db);
        const planned = captured.slice(0, keep);
        const taken: PlanLine[] = [];
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
          taken.push(
            summarize(planned.length === 1 ? label : `${label} (${String(index + 1)})`, document),
          );
        }
        return taken;
      },
      options.settings ?? [],
      captured,
    );
    everyPlan.push(...lines);
    return lines;
  }

  /**
   * Takes the plan of one statement built by a builder of `src`.
   *
   * @param label - What the statement is.
   * @param statement - The statement.
   * @param options - The planner settings.
   * @returns The plan.
   */
  async function planOf(
    label: string,
    statement: SQL,
    options: PlanOptions = {},
  ): Promise<PlanLine> {
    const [line] = await plansOf(label, (db) => db.execute(statement), { ...options, keep: 1 });
    if (line === undefined) {
      throw new Error(`No plan for ${label}.`);
    }
    return line;
  }

  /**
   * Runs one statement built by a builder of `src` in a tenant transaction and returns its rows.
   *
   * @param statement - The statement.
   * @returns Its rows.
   */
  async function rowsOf<TRow extends pg.QueryResultRow>(statement: SQL): Promise<TRow[]> {
    const query = new PgDialect().sqlToQuery(statement);
    return inTenant(
      async (_db, client) => (await client.query<TRow>(query.sql, query.params)).rows,
    );
  }

  /**
   * Reads the lists a member has a role on, as `ListVisibleListIds` of spaces does: the lean rows of
   * `listAccessesVisibleTo`, then the role of each by `toListRoles`.
   *
   * @param viewer - The member and its role.
   * @returns The ids, in the order of the sidebar.
   */
  async function visibleListIds(viewer: Viewer): Promise<string[]> {
    return inTenant(async (db) => {
      const rows = await new DrizzleTaskListRepository(db).listAccessesVisibleTo(
        atelierNordId,
        viewer,
      );
      return toListRoles(rows, viewer).map((role) => role.listId);
    });
  }

  /**
   * Seeds spaces, lists and grants in an organization, as an import would, as the migrator role,
   * with the shape of tests/access.int-spec.ts: one space in two private, one list in five closed to
   * the organization, grants of spaces to the accounts after the owners and grants of lists to all.
   *
   * @param organizationId - The organization.
   * @param owners - The accounts: the first `shape.owners` own the spaces.
   * @param shape - How much of each.
   * @param privateOwner - An account that owns one space in twelve instead, all private, or `null`.
   */
  async function seedSpaces(
    organizationId: string,
    owners: readonly string[],
    shape: VolumeShape,
    privateOwner: string | null,
  ): Promise<void> {
    await asSystem(
      `insert into spaces (organization_id, name, prefix, color, visibility, owner_user_id, statuses, created_at)
       select $1, 'Volume ' || n, 'VOL', 'gris',
              case when n % 2 = 0 then 'organization' else 'private' end,
              case when $5::uuid is not null and n % 12 = 1 then $5::uuid
                   else ($2::uuid[])[(n % $3::int) + 1] end,
              '{}'::jsonb, timestamptz '2026-01-05 08:00+00' + make_interval(secs => n * 10)
         from generate_series(0, $4::int - 1) as n`,
      [organizationId, owners, shape.owners, shape.spaces, privateOwner],
    );
    await asSystem(
      `insert into lists (organization_id, space_id, name, color, organization_access, created_at)
       select s.organization_id, s.id, 'Liste ' || k, 'gris', k % 5 <> 4, s.created_at + make_interval(secs => k)
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
        cross join generate_series(0, $4::int - 1) as k
       on conflict do nothing`,
      [organizationId, owners, shape.owners, shape.spaceGrants],
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
        where l.user_id <> l.owner_user_id
       on conflict do nothing`,
      [organizationId, owners, shape.listGrants],
    );
  }

  /**
   * Seeds the tasks of the seeded lists of an organization, as an import would: per list 12
   * top-level tasks, a subtask under each of the first six and one under each of the first three of
   * those, keyed `VOL-n`, one assignee of `pool` and one label each.
   *
   * @param organizationId - The organization.
   * @param pool - The accounts the tasks are assigned to in turn.
   */
  async function seedVolumeTasks(organizationId: string, pool: readonly string[]): Promise<void> {
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status,
                          priority, due_date, completed_at, cancel_reason, created_at, created_by_type,
                          created_by_id)
       select l.organization_id, l.space_id, l.id, 'VOL', (l.rank * ${String(TASKS_PER_LIST)} + k + 1)::int,
              'Tâche importée ' || (l.rank * ${String(TASKS_PER_LIST)} + k + 1), st.status,
              (array['urgente', 'haute', 'moyenne', 'basse'])[((l.rank + k) % 4)::int + 1],
              case when k % 3 = 2 then null else date '2026-11-01' + ((l.rank + k) % 20)::int end,
              case when st.status = 'done' then timestamptz '2026-10-15 08:00+00' end,
              case when st.status = 'cancelled' then 'duplicate' end,
              l.created_at + make_interval(secs => k * 10), 'user', l.owner_user_id::text
         from ${seededLists} as l
        cross join generate_series(0, 11) as k
        cross join lateral (select ${statusOf('l.rank + k')} as status) as st`,
      [organizationId],
    );
    // The subtasks of the first six top-level tasks (12 to 17), then of the first three of them
    // (18 to 20), one second after their parent.
    for (const [offset, from, to] of [
      [12, 0, 5],
      [6, 12, 14],
    ] as const) {
      await asSystem(
        `insert into tasks (organization_id, space_id, list_id, parent_id, key_prefix, key_number, name,
                            status, priority, due_date, completed_at, cancel_reason, created_at,
                            created_by_type, created_by_id)
         select p.organization_id, p.space_id, p.list_id, p.id, 'VOL', p.key_number + $2::int,
                'Sous-tâche de ' || p.name, st.status, 'moyenne',
                case when p.key_number % 4 = 0 then null else date '2026-11-03' + (p.key_number % 15) end,
                case when st.status = 'done' then timestamptz '2026-10-16 08:00+00' end,
                case when st.status = 'cancelled' then 'obsolete' end,
                p.created_at + interval '1 second', 'user', p.created_by_id
           from tasks as p
          cross join lateral (select ${statusOf('p.key_number * 3')} as status) as st
          where p.organization_id = $1 and p.key_prefix = 'VOL'
            and (p.key_number - 1) % ${String(TASKS_PER_LIST)} between $3::int and $4::int`,
        [organizationId, offset, from, to],
      );
    }
    await asSystem(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       select t.organization_id, t.id, ($2::uuid[])[(t.key_number % array_length($2::uuid[], 1)) + 1], 0
         from tasks as t where t.organization_id = $1 and t.key_prefix = 'VOL'`,
      [organizationId, pool],
    );
    await asSystem(
      `insert into task_labels (organization_id, task_id, label_key, name, position)
       select t.organization_id, t.id, 'étiquette ' || (t.key_number % 40), 'Étiquette ' || (t.key_number % 40), 0
         from tasks as t where t.organization_id = $1 and t.key_prefix = 'VOL'`,
      [organizationId],
    );
  }

  /**
   * Archives tasks with their live descendants, as `ArchiveTask` does: every member of an archive
   * gets the instant, the actor (the creator of the task) and the root of its archive.
   *
   * @param organizationId - The organization, `$1` of `roots`.
   * @param roots - A `select id, archived_at` of the roots, over `tasks as t`.
   * @param params - The parameters of `roots` after `$1`.
   */
  async function archiveSubtrees(
    organizationId: string,
    roots: string,
    params: readonly unknown[] = [],
  ): Promise<void> {
    await asSystem(
      `with recursive roots as (${roots}),
       members (id, root_id, archived_at) as (
         select id, id, archived_at from roots
         union all
         select child.id, members.root_id, members.archived_at
           from members join tasks as child
             on child.organization_id = $1 and child.parent_id = members.id and child.archived_at is null
       )
       update tasks as t
          set archived_at = members.archived_at, archived_by_type = 'user',
              archived_by_id = t.created_by_id, archive_root_id = members.root_id,
              archive_root = (members.root_id = t.id)
         from members
        where t.organization_id = $1 and t.id = members.id`,
      [organizationId, ...params],
    );
  }

  /**
   * Archives one task in five of the seeded lists of an organization: in the lists of even rank the
   * first top-level task with its two levels of subtasks, the fourth with its subtask and the ninth
   * alone; in the others the subtask of the second top-level task with its own subtask (an archive
   * rooted at a subtask, its parent live) and the tenth top-level task alone. Two lists in a
   * hundred are archived too: the first list of a space of the whole organization and the sixth of
   * a private space.
   *
   * @param organizationId - The organization.
   */
  async function archiveVolume(organizationId: string): Promise<void> {
    await archiveSubtrees(
      organizationId,
      `select t.id, timestamptz '2026-06-01 08:00+00' + make_interval(mins => t.key_number) as archived_at
         from tasks as t
        where t.organization_id = $1 and t.key_prefix = 'VOL'
          and ((((t.key_number - 1) / ${String(TASKS_PER_LIST)}) % 2 = 0 and (t.key_number - 1) % ${String(TASKS_PER_LIST)} in (0, 3, 8))
            or (((t.key_number - 1) / ${String(TASKS_PER_LIST)}) % 2 = 1 and (t.key_number - 1) % ${String(TASKS_PER_LIST)} in (9, 13)))`,
    );
    await asSystem(
      `update lists as li
          set archived_at = timestamptz '2026-09-01 08:00+00' + make_interval(hours => l.rank::int),
              archived_by_type = 'user', archived_by_id = l.owner_user_id::text
         from ${seededLists} as l
        where li.organization_id = $1 and li.id = l.id and l.rank % 100 in (20, 75)`,
      [organizationId],
    );
  }

  /**
   * Seeds "Produit" with its first list, "Backlog produit" and "Sprint 14" (the dates and goal of the
   * mockup), and the space "Import massif" with its large list, owned by Camille, before the volume.
   */
  async function seedProduit(): Promise<void> {
    const created = await asSystem<{ readonly id: string; readonly name: string }>(
      `insert into spaces (organization_id, name, prefix, icon, color, visibility, owner_user_id, statuses, created_at)
       values ($1, 'Produit', 'CAD', 'rocket', 'violet', 'organization', $2, '{}'::jsonb, timestamptz '2026-01-01 08:00+00'),
              ($1, 'Import massif', 'BLK', null, 'gris', 'organization', $2, '{}'::jsonb, timestamptz '2026-01-02 08:00+00')
       returning id::text as id, name`,
      [atelierNordId, camille.userId],
    );
    produitId = created.find((row) => row.name === 'Produit')?.id ?? '';
    largeSpaceId = created.find((row) => row.name === 'Import massif')?.id ?? '';
    const lists = await asSystem<{ readonly id: string; readonly name: string }>(
      `insert into lists (organization_id, space_id, name, color, sprint_start_date, sprint_end_date, sprint_goal, created_at)
       values ($1, $2, 'Première liste', 'gris', null, null, null, timestamptz '2026-01-01 08:00+00'),
              ($1, $2, 'Backlog produit', 'gris', null, null, null, timestamptz '2026-01-01 08:01+00'),
              ($1, $2, 'Sprint 14', 'violet', date '2026-11-03', date '2026-11-17',
               'Livrer la connexion SSO et la page des quotas d’organisation.', timestamptz '2026-01-01 08:02+00'),
              ($1, $3, 'Import de l’an dernier', 'gris', null, null, null, timestamptz '2026-01-02 08:00+00')
       returning id::text as id, name`,
      [atelierNordId, produitId, largeSpaceId],
    );
    const idOf = (name: string): string => lists.find((row) => row.name === name)?.id ?? '';
    sprint14Id = idOf('Sprint 14');
    largeListId = idOf('Import de l’an dernier');
  }

  /**
   * Seeds "Sprint 14" as tests/task-queries.int-spec.ts does (98 top-level tasks, of which 24 are
   * done, 2 cancelled, 72 open and 3 late on 2026-11-08, and 150 subtasks), then 10 open and late
   * top-level tasks with two subtasks each, archived: the counters of the list must not count them.
   */
  async function seedSprint14(): Promise<void> {
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
      [atelierNordId, produitId, sprint14Id, sprint14Base, camille.userId],
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
      [atelierNordId, sprint14Id, sprint14Base, camille.userId],
    );
    // Ten open top-level tasks, late on 2026-11-08, with two open subtasks each, archived below.
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status,
                          priority, due_date, created_at, created_by_type, created_by_id)
       select $1, $2, $3, 'CAD', $4::int + 248 + n, 'Tâche archivée du sprint ' || n, 'todo', 'haute',
              date '2026-11-01', timestamptz '2026-11-01 10:00+00' + n * interval '1 minute', 'user', $5
         from generate_series(1, 10) as n`,
      [atelierNordId, produitId, sprint14Id, sprint14Base, camille.userId],
    );
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, parent_id, key_prefix, key_number, name,
                          status, priority, due_date, created_at, created_by_type, created_by_id)
       select p.organization_id, p.space_id, p.list_id, p.id, 'CAD',
              $3::int + 258 + (p.key_number - $3::int - 249) * 2 + k, 'Sous-tâche ' || k || ' de ' || p.name,
              'progress', 'moyenne', date '2026-11-02', p.created_at + k * interval '1 second', 'user', $4
         from tasks p cross join generate_series(1, 2) as k
        where p.organization_id = $1 and p.list_id = $2 and p.key_number - $3::int > 248`,
      [atelierNordId, sprint14Id, sprint14Base, camille.userId],
    );
    await asSystem(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       select t.organization_id, t.id, (array[$4::uuid, $5::uuid, $6::uuid])[1 + (t.key_number - $3::int) % 3], 0
         from tasks t
        where t.organization_id = $1 and t.list_id = $2 and (t.key_number - $3::int) % 4 <> 0`,
      [atelierNordId, sprint14Id, sprint14Base, ines.userId, mathis.userId, chloe.userId],
    );
    const values = mockupLabels
      .map(([key, name], index) => `(${String(index)}, '${key}', '${name}')`)
      .join(', ');
    await asSystem(
      `insert into task_labels (organization_id, task_id, label_key, name, position)
       select t.organization_id, t.id, l.label_key, l.name, 0
         from tasks t join (values ${values}) as l(i, label_key, name) on l.i = (t.key_number - $3::int) % 10
        where t.organization_id = $1 and t.list_id = $2 and t.parent_id is null`,
      [atelierNordId, sprint14Id, sprint14Base],
    );
    await asSystem(
      `insert into activity_entries (organization_id, task_id, list_id, kind, actor_type, actor_id, occurred_at)
       select t.organization_id, t.id, t.list_id, 'create', 'user', t.created_by_id, t.created_at
         from tasks as t where t.organization_id = $1 and t.list_id = $2`,
      [atelierNordId, sprint14Id],
    );
    await archiveSubtrees(
      atelierNordId,
      `select t.id, timestamptz '2026-11-06 12:00+00' + make_interval(mins => t.key_number - $3::int) as archived_at
         from tasks as t
        where t.organization_id = $1 and t.list_id = $2 and t.parent_id is null and t.key_number - $3::int > 248`,
      [sprint14Id, sprint14Base],
    );
  }

  /**
   * Seeds the large list as an import would: 16,000 top-level tasks, a subtask under one in four,
   * assigned to Camille, Inès and Mathis in turn (one in four to Camille, a few subtasks too), with
   * labels of the mockup and an activity entry each; then archives the oldest 4,800 top-level tasks
   * with their subtasks, as a member who archives what is done.
   */
  async function seedLargeList(): Promise<void> {
    const statuses = `(array['triage', 'backlog', 'todo', 'progress', 'review', 'testing', 'waiting', 'blocked', 'done', 'cancelled'])`;
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status,
                          priority, due_date, completed_at, cancel_reason, created_at, created_by_type,
                          created_by_id)
       select $1, $2, $3, 'BLK', $4::int + n,
              case when n % 50 = 0 then 'Refonte SSO ' else 'Tâche ' end || md5(n::text) || ' n°' || n,
              st.status, (array['urgente', 'haute', 'moyenne', 'basse'])[1 + n % 4],
              case when n % 3 = 0 then null else date '2026-10-01' + (n % 90) end,
              case when st.status = 'done' then timestamptz '2026-10-01 08:00+00' + n * interval '1 second' end,
              case when st.status = 'cancelled' then 'duplicate' end,
              timestamptz '2026-03-02 08:00+00' + n * interval '37 seconds', 'user', $5
         from generate_series(1, $6::int) as n
        cross join lateral (select ${statuses}[1 + (n / 5) % 10] as status) as st`,
      [atelierNordId, largeSpaceId, largeListId, largeBase, camille.userId, LARGE_LIST.tops],
    );
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, parent_id, key_prefix, key_number, name,
                          status, priority, due_date, completed_at, cancel_reason, created_at,
                          created_by_type, created_by_id)
       select p.organization_id, p.space_id, p.list_id, p.id, 'BLK', p.key_number + $4::int,
              'Sous-tâche de ' || p.name, st.status, 'moyenne',
              case when p.key_number % 8 = 0 then null else date '2026-10-15' + (p.key_number % 60) end,
              case when st.status = 'done' then timestamptz '2026-10-02 08:00+00' end,
              case when st.status = 'cancelled' then 'obsolete' end,
              p.created_at + interval '1 second', 'user', p.created_by_id
         from tasks as p
        cross join lateral (select ${statuses}[1 + (p.key_number * 3) % 10] as status) as st
        where p.organization_id = $1 and p.list_id = $2 and p.parent_id is null
          and (p.key_number - $3::int) % 4 = 0`,
      [atelierNordId, largeListId, largeBase, LARGE_LIST.tops],
    );
    await asSystem(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       select t.organization_id, t.id,
              case when t.parent_id is not null and (t.key_number - $3::int) % 8 = 0 then $4::uuid
                   when t.parent_id is not null then $6::uuid
                   else (array[$4::uuid, $5::uuid, $6::uuid])[(t.key_number - $3::int) % 4] end,
              0
         from tasks as t
        where t.organization_id = $1 and t.list_id = $2
          and (t.parent_id is not null or (t.key_number - $3::int) % 4 <> 0)`,
      [atelierNordId, largeListId, largeBase, camille.userId, ines.userId, mathis.userId],
    );
    const values = mockupLabels
      .map(([key, name], index) => `(${String(index)}, '${key}', '${name}')`)
      .join(', ');
    await asSystem(
      `insert into task_labels (organization_id, task_id, label_key, name, position)
       select t.organization_id, t.id, l.label_key, l.name, 0
         from tasks t join (values ${values}) as l(i, label_key, name) on l.i = ((t.key_number - $3::int) / 7) % 10
        where t.organization_id = $1 and t.list_id = $2 and (t.key_number - $3::int) % 5 < 3`,
      [atelierNordId, largeListId, largeBase],
    );
    await asSystem(
      `insert into activity_entries (organization_id, task_id, list_id, kind, actor_type, actor_id, occurred_at)
       select t.organization_id, t.id, t.list_id, 'create', 'user', t.created_by_id, t.created_at
         from tasks as t where t.organization_id = $1 and t.list_id = $2`,
      [atelierNordId, largeListId],
    );
    await archiveSubtrees(
      atelierNordId,
      `select t.id, timestamptz '2026-10-01 08:00+00' + make_interval(secs => (t.key_number - $3::int) * 30) as archived_at
         from tasks as t
        where t.organization_id = $1 and t.list_id = $2 and t.parent_id is null
          and t.key_number - $3::int <= $4::int`,
      [largeListId, largeBase, LARGE_LIST.archivedTops],
    );
  }

  /**
   * The ids of tasks of the volume of Atelier Nord, by key number.
   *
   * @param numbers - The key numbers of `VOL-n`.
   * @returns The ids, in the order of the numbers.
   */
  async function volumeTaskIds(numbers: readonly number[]): Promise<string[]> {
    const rows = await asSystem<{ readonly id: string; readonly key_number: number }>(
      `select id::text as id, key_number from tasks
        where organization_id = $1 and key_prefix = 'VOL' and key_number = any($2::int[])`,
      [atelierNordId, numbers],
    );
    return numbers.map((number) => rows.find((row) => row.key_number === number)?.id ?? '');
  }

  /**
   * The ten lists of a person that hold the most of their assignments, live or archived, among the
   * lists they have a role on: the small array of the comparison of "Mes tâches".
   *
   * @param userId - The person.
   * @param listIds - The lists they have a role on.
   * @returns Ten list ids.
   */
  async function busiestLists(userId: string, listIds: readonly string[]): Promise<string[]> {
    const rows = await asSystem<{ readonly list_id: string }>(
      `select t.list_id::text as list_id
         from task_assignees as a join tasks as t on t.organization_id = a.organization_id and t.id = a.task_id
        where a.organization_id = $1 and a.user_id = $2 and t.list_id = any($3::uuid[])
        group by t.list_id order by count(*) desc, t.list_id limit 10`,
      [atelierNordId, userId, listIds],
    );
    return rows.map((row) => row.list_id);
  }

  /**
   * The spaces of some lists, the filter of the shape of P3a.
   *
   * @param listIds - The lists.
   * @returns The ids of their spaces.
   */
  async function spacesOf(listIds: readonly string[]): Promise<string[]> {
    const rows = await asSystem<{ readonly space_id: string }>(
      `select distinct space_id::text as space_id from lists where organization_id = $1 and id = any($2::uuid[])`,
      [atelierNordId, listIds],
    );
    return rows.map((row) => row.space_id);
  }

  beforeAll(async () => {
    compose('up', '--detach', '--wait', '--wait-timeout', '120', 'postgres');
    const postgresPort = hostPort('postgres', '5432');
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
    application = new pg.Pool({
      connectionString: `postgres://task_app:task_app@127.0.0.1:${postgresPort}/task`,
      max: 1,
    });

    await seedProduit();
    await seedSpaces(
      atelierNordId,
      accounts,
      { owners: 300, spaces: 300, listsPerSpace: 10, spaceGrants: 20, listGrants: 10 },
      camille.userId,
    );
    await seedSpaces(
      atelierDeltaId,
      noise,
      { owners: 100, spaces: 100, listsPerSpace: 10, spaceGrants: 20, listGrants: 10 },
      null,
    );
    await seedSprint14();
    await seedLargeList();
    await seedVolumeTasks(
      atelierNordId,
      accounts.filter((account) => account !== memberId),
    );
    await seedVolumeTasks(atelierDeltaId, noise);
    // Camille: one task in eight of the volume lists she has a role on (those of the spaces of the
    // whole organization open to it, and of her own private spaces), as a second assignee.
    await asSystem(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       select t.organization_id, t.id, $2::uuid, 1
         from tasks as t
         join lists as li on li.organization_id = t.organization_id and li.id = t.list_id
         join spaces as sp on sp.organization_id = li.organization_id and sp.id = li.space_id
        where t.organization_id = $1 and t.key_prefix = 'VOL' and t.key_number % 8 = 0
          and ((sp.visibility = 'organization' and li.organization_access) or sp.owner_user_id = $2::uuid)`,
      [atelierNordId, camille.userId],
    );
    // The member also views ten private spaces of others: with the grants of the volume, a role on
    // about 1,400 lists, as in tests/access.int-spec.ts.
    await asSystem(
      `insert into space_grants
         (organization_id, space_id, user_id, role, granted_by_type, granted_by_id, created_at, granted_at)
       select s.organization_id, s.id, $2::uuid, 'view', 'user', s.owner_user_id::text, now(), now()
         from spaces as s
        where s.organization_id = $1 and s.name like 'Volume %' and s.visibility = 'private'
          and s.owner_user_id <> $3::uuid
        order by s.created_at, s.id
        limit 10
       on conflict do nothing`,
      [atelierNordId, memberId, camille.userId],
    );
    await archiveVolume(atelierNordId);
    await archiveVolume(atelierDeltaId);

    camilleLists = await visibleListIds(asOwner);
    memberLists = await visibleListIds(asMember);
    // The member: one task in 293 of the lists they have a role on, as a second assignee.
    await asSystem(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       select t.organization_id, t.id, $2::uuid, 1 from tasks as t
        where t.organization_id = $1 and t.key_prefix = 'VOL' and t.list_id = any($3::uuid[])
          and t.key_number % 293 = 7
       on conflict do nothing`,
      [atelierNordId, memberId, memberLists],
    );
    // The statistics and the visibility map an autovacuum would have produced after such an import
    // and the archives that rewrote a fifth of the rows.
    await migrator.query(
      `vacuum (analyze) spaces, lists, space_grants, list_grants, tasks, task_assignees, task_labels, activity_entries`,
    );
    const [size] = await asSystem<{
      readonly tasks: number;
      readonly lists: number;
      readonly rows: number;
    }>(
      `select (pg_relation_size('tasks') / 8192)::int as tasks, (pg_relation_size('lists') / 8192)::int as lists,
              (select count(*)::int from lists) as rows`,
    );
    tasksBlocks = size?.tasks ?? 0;
    listBlocks = size?.lists ?? 0;
    listRows = size?.rows ?? 0;
  }, 900_000);

  afterAll(async () => {
    try {
      await application.end();
      await migrator.end();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  });

  it('holds the volumes the plans are taken on', async () => {
    const [volume] = await asSystem<Record<string, number>>(
      `select
         (select count(*)::int from tasks where organization_id = $1) as tasks,
         (select count(*)::int from tasks where organization_id = $1 and archived_at is not null) as "archivedTasks",
         (select count(*)::int from tasks where organization_id = $1 and archive_root) as "archiveRoots",
         (select count(*)::int from tasks where organization_id = $1 and archive_root and parent_id is not null) as "subtaskRoots",
         (select max(members)::int from (select count(*) as members from tasks where organization_id = $1
             and archive_root_id is not null group by archive_root_id) as m) as "largestArchive",
         (select count(*)::int from tasks where organization_id = $1 and list_id = $3) as "largeList",
         (select count(*)::int from tasks where organization_id = $1 and list_id = $3 and archived_at is not null) as "largeListArchived",
         (select count(*)::int from tasks where organization_id = $1 and list_id = $4) as "sprint14",
         (select count(*)::int from tasks where organization_id = $1 and list_id = $4 and archived_at is not null) as "sprint14Archived",
         (select count(*)::int from lists where organization_id = $1) as lists,
         (select count(*)::int from lists where organization_id = $1 and archived_at is not null) as "archivedLists",
         (select count(*)::int from task_assignees where organization_id = $1) as assignments,
         (select count(*)::int from task_assignees where organization_id = $1 and user_id = $5) as camille,
         (select count(*)::int from task_assignees as a join tasks as t on t.organization_id = a.organization_id
             and t.id = a.task_id where a.organization_id = $1 and a.user_id = $5 and t.archived_at is not null) as "camilleArchived",
         (select count(*)::int from task_assignees where organization_id = $1 and user_id = $6) as member,
         (select count(*)::int from task_assignees as a join tasks as t on t.organization_id = a.organization_id
             and t.id = a.task_id where a.organization_id = $1 and a.user_id = $6 and t.archived_at is not null) as "memberArchived",
         (select count(*)::int from space_grants where organization_id = $1) as "spaceGrants",
         (select count(*)::int from list_grants where organization_id = $1) as "listGrants",
         (select count(*)::int from task_labels where organization_id = $1) as labels,
         (select count(*)::int from activity_entries where organization_id = $1) as activity,
         (select count(*)::int from tasks where organization_id = $2) as "otherTasks",
         (select count(*)::int from tasks where organization_id = $2 and archived_at is not null) as "otherArchived",
         (select count(*)::int from lists where organization_id = $2) as "otherLists",
         (select count(*)::int from tasks) as "tableTasks"`,
      [atelierNordId, atelierDeltaId, largeListId, sprint14Id, camille.userId, memberId],
    );
    console.info(
      `archive plans volume: ${JSON.stringify({ ...volume, tasksBlocks, listRows, listBlocks, camilleLists: camilleLists.length, memberLists: memberLists.length })}`,
    );
    expect(volume?.tasks).toBeGreaterThanOrEqual(75_000);
    expect(volume?.archiveRoots).toBeGreaterThan(5_000);
    expect(volume?.subtaskRoots).toBeGreaterThan(1_000);
    expect(volume?.largestArchive).toBe(3);
    expect(volume).toMatchObject({
      largeList: LARGE_LIST.tops + LARGE_LIST.subtasks,
      largeListArchived: 6_000,
      sprint14: 98 + 150 + 30,
      sprint14Archived: 30,
      archivedLists: 60,
    });
    expect(volume?.lists).toBeGreaterThan(3_000);
    expect(volume?.camille).toBeGreaterThan(9_000);
    expect(volume?.camille).toBeLessThan(11_500);
    expect(volume?.camilleArchived).toBeGreaterThan(1_000);
    expect(volume?.member).toBeGreaterThan(70);
    expect(volume?.member).toBeLessThan(130);
    expect(volume?.memberArchived).toBeGreaterThan(0);
    expect(volume?.otherTasks).toBeGreaterThan(5_000);
    expect(camilleLists.length).toBeGreaterThan(1_300);
    expect(memberLists.length).toBeGreaterThan(1_300);
  });

  it('leaves the archived tasks of Sprint 14 out of its counters, and serves its page, total, groups and counters from a range of tasks_list_created_index under 2 % of the blocks of tasks', async () => {
    const [counts] = await rowsOf<{ readonly listId: string }>(
      countsOfListsStatement(atelierNordId, [sprint14Id], today),
    );
    expect(counts).toMatchObject({ total: 98, open: 72, done: 24, cancelled: 2, late: 3 });
    const [all] = await rowsOf<{ readonly total: number }>(
      countStatement(atelierNordId, sprint14Id, { ...emptyFilter, rootsOnly: false }),
    );
    expect(all?.total).toBe(248);

    const plans: PlanLine[] = [
      await planOf(
        'Sprint 14: page manual',
        pageStatement(
          atelierNordId,
          sprint14Id,
          emptyFilter,
          { key: 'manual', descending: false },
          null,
          51,
        ),
      ),
      await planOf(
        'Sprint 14: page dueDate',
        pageStatement(
          atelierNordId,
          sprint14Id,
          emptyFilter,
          { key: 'dueDate', descending: false },
          null,
          51,
        ),
      ),
      await planOf(
        'Sprint 14: page manual, level all',
        pageStatement(
          atelierNordId,
          sprint14Id,
          { ...emptyFilter, rootsOnly: false },
          { key: 'manual', descending: false },
          null,
          51,
        ),
      ),
      await planOf('Sprint 14: total', countStatement(atelierNordId, sprint14Id, emptyFilter)),
      await planOf(
        'Sprint 14: groups status',
        groupStatement(atelierNordId, sprint14Id, emptyFilter, 'status'),
      ),
      await planOf(
        'Sprint 14: list counts',
        countsOfListsStatement(atelierNordId, [sprint14Id], today),
      ),
    ];

    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    for (const plan of plans) {
      expect(plan.seqScans, `${plan.label}: ${plan.nodes.join(' > ')}`).not.toContain('tasks');
      expect(plan.indexes, plan.label).toContain('tasks_list_created_index');
      expect(
        plan.blocks,
        `${plan.label} reads ${String(plan.blocks)} of ${String(tasksBlocks)} blocks`,
      ).toBeLessThan(tasksBlocks * 0.02);
      expect(plan.milliseconds, plan.label).toBeLessThan(300);
    }
  }, 300_000);

  it('walks tasks_archive_root_index for the page and the total of the archived roots, and tasks_archive_member_index for the members of an archive', async () => {
    const firstPage = await rowsOf<{ readonly id: string; readonly archivedAt: string }>(
      archivedRootsPageStatement(atelierNordId, camilleLists, null, 51),
    );
    expect(firstPage).toHaveLength(51);
    const last = firstPage.at(-1);
    const after: ArchivePosition = {
      archivedAt: new Date(last?.archivedAt ?? ''),
      id: last?.id ?? '',
    };
    const rootIds = firstPage.slice(0, 50).map((row) => row.id);
    const [root] = await volumeTaskIds([43]);

    const plans: PlanLine[] = [
      await planOf(
        'archived roots: page 1 of Camille',
        archivedRootsPageStatement(atelierNordId, camilleLists, null, 51),
      ),
      await planOf(
        'archived roots: page 2 of Camille',
        archivedRootsPageStatement(atelierNordId, camilleLists, after, 51),
      ),
      await planOf(
        'archived roots: total of Camille',
        archivedRootsCountStatement(atelierNordId, camilleLists),
      ),
      await planOf(
        'archived roots: page 1 of the member',
        archivedRootsPageStatement(atelierNordId, memberLists, null, 51),
      ),
      await planOf(
        'archived roots: total of the member',
        archivedRootsCountStatement(atelierNordId, memberLists),
      ),
      await planOf(
        'archived roots: page 1 of ten lists',
        archivedRootsPageStatement(atelierNordId, camilleLists.slice(0, 10), null, 51),
      ),
      await planOf(
        'archived roots: total of ten lists',
        archivedRootsCountStatement(atelierNordId, camilleLists.slice(0, 10)),
      ),
    ];
    const members: PlanLine[] = [
      ...(await plansOf(
        'archive members: lock of one archive (lockArchive)',
        (db) => new DrizzleTaskRepository(db).lockArchive(atelierNordId, root ?? ''),
        { keep: 1 },
      )),
      await planOf(
        'archive members: counts of 50 roots',
        archiveMemberCountsStatement(atelierNordId, rootIds),
      ),
    ];

    for (const plan of [...plans, ...members]) {
      console.info(lineOf(plan));
    }
    expect(seqScansOf([...plans, ...members], ['tasks'])).toEqual([]);
    for (const plan of plans) {
      expect(plan.indexes, `${plan.label}: ${plan.nodes.join(' > ')}`).toContain(
        'tasks_archive_root_index',
      );
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    // Every page walks the partial index from its keyset and stops at the limit: with the predicate
    // `archive_root_id = id`, which PostgreSQL cannot estimate, the second page sorted every root
    // after a bitmap scan (589 buffers, 11.7 ms against 5 buffers for the walk); `archive_root`
    // has statistics of its own.
    for (const plan of plans.filter((line) => line.label.includes('page'))) {
      expect(plan.nodes.join(' > '), plan.label).not.toContain('Bitmap Heap Scan');
      expect(plan.blocks, plan.label).toBeLessThan(100);
    }
    for (const plan of members) {
      expect(plan.indexes, `${plan.label}: ${plan.nodes.join(' > ')}`).toContain(
        'tasks_archive_member_index',
      );
      expect(plan.milliseconds, plan.label).toBeLessThan(300);
    }
  }, 300_000);

  it('reads the archived lists and their total through lists_organization_archived_index, the lists of a page by primary key, and their live tasks by tasks_list_created_index', async () => {
    const page = await inTenant((db) =>
      new DrizzleTaskListRepository(db).listArchivedVisibleTo(atelierNordId, asOwner, null, 51),
    );
    expect(page.length).toBeGreaterThan(10);
    const archivedListIds = page.map((row) => row.list.snapshot.id);
    const rootLists = await rowsOf<{ readonly listId: string }>(
      archivedRootsPageStatement(atelierNordId, camilleLists, null, 51),
    );
    const pageListIds = [...new Set(rootLists.map((row) => row.listId))];

    const listPlans: PlanLine[] = [
      ...(await plansOf('archived lists: page of Camille (listArchivedVisibleTo)', (db) =>
        new DrizzleTaskListRepository(db).listArchivedVisibleTo(atelierNordId, asOwner, null, 51),
      )),
      ...(await plansOf('archived lists: total of Camille (countArchivedVisibleTo)', (db) =>
        new DrizzleTaskListRepository(db).countArchivedVisibleTo(atelierNordId, asOwner),
      )),
      ...(await plansOf('archived lists: page of the member (listArchivedVisibleTo)', (db) =>
        new DrizzleTaskListRepository(db).listArchivedVisibleTo(atelierNordId, asMember, null, 51),
      )),
      ...(await plansOf('archived lists: total of the member (countArchivedVisibleTo)', (db) =>
        new DrizzleTaskListRepository(db).countArchivedVisibleTo(atelierNordId, asMember),
      )),
      ...(await plansOf('lists of a page of archived roots (listVisibleByIds)', (db) =>
        new DrizzleTaskListRepository(db).listVisibleByIds(atelierNordId, asMember, pageListIds),
      )),
    ];
    const counts = await planOf(
      'archived lists: live top-level tasks of the page (liveRootCountsStatement)',
      liveRootCountsStatement(atelierNordId, archivedListIds),
    );

    console.info(
      `archive plans: lists holds ${String(listRows)} rows in ${String(listBlocks)} blocks`,
    );
    for (const plan of [...listPlans, counts]) {
      console.info(lineOf(plan));
    }
    expect(listRows).toBeGreaterThan(3_000);
    expect(seqScansOf(listPlans, ['lists'])).toEqual([]);
    for (const plan of listPlans.slice(0, 4)) {
      expect(plan.indexes, `${plan.label}: ${plan.nodes.join(' > ')}`).toContain(
        'lists_organization_archived_index',
      );
    }
    expect(counts.seqScans).not.toContain('tasks');
    expect(counts.indexes).toContain('tasks_list_created_index');
    for (const plan of [...listPlans, counts]) {
      expect(plan.milliseconds, plan.label).toBeLessThan(300);
    }
  }, 300_000);

  it('counts and lists the subtasks of a page through the join on the parent, and the live child count and subtree through tasks_parent_created_index', async () => {
    const livePage = await rowsOf<{ readonly id: string }>(
      pageStatement(
        atelierNordId,
        largeListId,
        emptyFilter,
        { key: 'manual', descending: false },
        null,
        50,
      ),
    );
    const archivedPage = await rowsOf<{ readonly id: string }>(
      archivedRootsPageStatement(atelierNordId, camilleLists, null, 50),
    );
    // In "Liste 2" of "Volume 0": VOL-44 is live with a live subtask and sub-subtask, VOL-43 the
    // root of an archive of three levels; in "Liste 3", VOL-65 is live and its only subtask VOL-77
    // the root of an archive of two levels.
    const [liveParent, archivedRoot, parentOfArchive] = await volumeTaskIds([44, 43, 65]);
    const reader = (db: TransactionDatabase): DrizzleTaskReader => new DrizzleTaskReader(db);
    const repository = (db: TransactionDatabase): DrizzleTaskRepository =>
      new DrizzleTaskRepository(db);

    const counted = await inTenant(async (db) => ({
      live: await repository(db).childCount(atelierNordId, parentOfArchive ?? ''),
      subtree: await repository(db).subtreeOf(atelierNordId, liveParent ?? ''),
      archivedChildren: await reader(db).countChildren(atelierNordId, archivedRoot ?? ''),
      liveChildren: await reader(db).countChildren(atelierNordId, parentOfArchive ?? ''),
    }));
    expect(counted.live).toBe(0);
    expect(counted.subtree.descendantIds).toHaveLength(2);
    expect(counted.archivedChildren).toBe(1);
    expect(counted.liveChildren).toBe(0);

    const plans: PlanLine[] = [
      ...(await plansOf('subtask counts of a page of 50 live tasks (subtaskCountsOf)', (db) =>
        new DrizzleTaskCollections(db).subtaskCountsOf(
          atelierNordId,
          livePage.map((row) => row.id),
        ),
      )),
      ...(await plansOf('subtask counts of a page of 50 archived roots (subtaskCountsOf)', (db) =>
        new DrizzleTaskCollections(db).subtaskCountsOf(
          atelierNordId,
          archivedPage.map((row) => row.id),
        ),
      )),
      ...(await plansOf(
        'children of a live task (childrenOf)',
        (db) => reader(db).childrenOf(atelierNordId, liveParent ?? '', null, 51),
        { keep: 1 },
      )),
      ...(await plansOf(
        'children of an archived root (childrenOf)',
        (db) => reader(db).childrenOf(atelierNordId, archivedRoot ?? '', null, 51),
        { keep: 1 },
      )),
      ...(await plansOf('count of the children of a live task (countChildren)', (db) =>
        reader(db).countChildren(atelierNordId, liveParent ?? ''),
      )),
      ...(await plansOf('live child count of a task (childCount)', (db) =>
        repository(db).childCount(atelierNordId, parentOfArchive ?? ''),
      )),
      ...(await plansOf('live subtree of a task (subtreeOf)', (db) =>
        repository(db).subtreeOf(atelierNordId, liveParent ?? ''),
      )),
      ...(await plansOf('live subtree of a task whose subtask is archived (subtreeOf)', (db) =>
        repository(db).subtreeOf(atelierNordId, parentOfArchive ?? ''),
      )),
    ];

    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    expect(plans).toHaveLength(8);
    expect(seqScansOf(plans, ['tasks'])).toEqual([]);
    for (const plan of plans) {
      expect(plan.indexes, `${plan.label}: ${plan.nodes.join(' > ')}`).toContain(
        'tasks_parent_created_index',
      );
      expect(plan.milliseconds, plan.label).toBeLessThan(300);
    }
    // The subtask reads join the parent by its primary key.
    for (const plan of plans.slice(0, 5)) {
      expect(plan.indexes, `${plan.label}: ${plan.nodes.join(' > ')}`).toContain('tasks_pkey');
    }
  }, 300_000);

  it('takes the plans of the large list, the labels and the activity of a list with the live condition, for the report', async () => {
    const manual: TaskOrder = { key: 'manual', descending: false };
    const firstFifty = await rowsOf<{
      readonly id: string;
      readonly createdAt: string;
      readonly sortValue: string | number | null;
    }>(pageStatement(atelierNordId, largeListId, emptyFilter, manual, null, 50));
    const last = firstFifty.at(-1);
    const after: TaskPosition = {
      sortValue: last?.sortValue ?? null,
      createdAt: new Date(last?.createdAt ?? ''),
      id: last?.id ?? '',
    };
    const plans: PlanLine[] = [
      await planOf(
        'large list: page manual',
        pageStatement(atelierNordId, largeListId, emptyFilter, manual, null, 51),
      ),
      await planOf(
        'large list: page 2 manual',
        pageStatement(atelierNordId, largeListId, emptyFilter, manual, after, 51),
      ),
      await planOf(
        'large list: page -manual',
        pageStatement(
          atelierNordId,
          largeListId,
          emptyFilter,
          { key: 'manual', descending: true },
          null,
          51,
        ),
      ),
      await planOf(
        'large list: page dueDate',
        pageStatement(
          atelierNordId,
          largeListId,
          emptyFilter,
          { key: 'dueDate', descending: false },
          null,
          51,
        ),
      ),
      await planOf(
        'large list: page manual, level all',
        pageStatement(
          atelierNordId,
          largeListId,
          { ...emptyFilter, rootsOnly: false },
          manual,
          null,
          51,
        ),
      ),
      await planOf('large list: total', countStatement(atelierNordId, largeListId, emptyFilter)),
      await planOf(
        'large list: groups status',
        groupStatement(atelierNordId, largeListId, emptyFilter, 'status'),
      ),
      await planOf(
        'large list: groups assignee',
        groupStatement(atelierNordId, largeListId, emptyFilter, 'assignee'),
      ),
      await planOf(
        'large list: list counts',
        countsOfListsStatement(atelierNordId, [largeListId], today),
      ),
      await planOf(
        'Accueil: counts of the first six lists',
        countsOfListsStatement(atelierNordId, camilleLists.slice(0, 6), today),
      ),
      await planOf(
        'labels: page of Camille (labelPageStatement)',
        labelPageStatement(atelierNordId, camilleLists, null, null, 51),
      ),
      await planOf(
        'labels: page of the member (labelPageStatement)',
        labelPageStatement(atelierNordId, memberLists, null, null, 51),
      ),
      ...(await plansOf('activity of the large list: page (pageOfList)', (db) =>
        new DrizzleActivityRepository(db).pageOfList(
          atelierNordId,
          { listId: largeListId, listIds: camilleLists, kinds: null, actorIds: null },
          null,
          51,
        ),
      )),
      ...(await plansOf('activity of the large list: total (countOfList)', (db) =>
        new DrizzleActivityRepository(db).countOfList(atelierNordId, {
          listId: largeListId,
          listIds: camilleLists,
          kinds: null,
          actorIds: null,
        }),
      )),
    ];

    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    expect(plans).toHaveLength(14);
    for (const plan of plans.slice(0, 2)) {
      expect(plan.indexes, plan.label).toContain('tasks_list_created_index');
    }
    for (const plan of plans) {
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
  }, 300_000);

  describe('"Mes tâches" and "Accueil" in the shapes of P3a, PR 1 and PR 2', () => {
    /**
     * The condition of the assigned tasks in a shape: P3a filtered `tasks.space_id` by the spaces
     * the actor sees (`git show fafcaf0:...assigned-task.mapper.ts`), PR 1 `tasks.list_id` by the
     * lists they have a role on (`git show de02b6f:...`), PR 2 adds `liveTask`
     * (`assignedTasksCondition` of `src`).
     *
     * @param shape - The shape.
     * @param userId - The account.
     * @param ids - The space ids for P3a, the list ids otherwise.
     * @returns The condition.
     */
    function conditionOf(shape: AssignedShape, userId: string, ids: readonly string[]): SQL {
      if (shape === 'c PR 2') {
        return assignedTasksCondition(atelierNordId, userId, ids);
      }
      return (
        and(
          eq(taskAssignees.organizationId, atelierNordId),
          eq(taskAssignees.userId, userId),
          eq(tasks.organizationId, atelierNordId),
          anyOf(shape === 'a P3a' ? tasks.spaceId : tasks.listId, ids, 'uuid'),
        ) ?? sql`false`
      );
    }

    /**
     * A page of "Mes tâches" with the template of `assignedPageStatement` of `src` and the condition
     * of a shape, first page (no keyset).
     *
     * @param condition - The condition of the shape.
     * @param state - The tab.
     * @param limit - How many rows.
     * @returns The statement.
     */
    function pageWith(condition: SQL, state: MyTaskState, limit: number): SQL {
      return sql`select ${taskPageColumns()}, ${sortValueExpression(assignedOrder)} as "sortValue" from ${assignedTasksSource()} where ${condition} and ${state === 'open' ? isNotClosed() : isClosed()} order by ${orderTerms(assignedOrder)} limit ${limit}`;
    }

    /**
     * The five statements of "Mes tâches" and "Accueil" in a shape: built by `src` for PR 2, with the
     * templates of `src` and the condition of the shape for P3a and PR 1.
     *
     * @param shape - The shape.
     * @param userId - The account.
     * @param ids - The space ids for P3a, the list ids otherwise.
     * @returns The statements, by name.
     */
    function assignedProbes(
      shape: AssignedShape,
      userId: string,
      ids: readonly string[],
    ): readonly AssignedProbe[] {
      if (shape === 'c PR 2') {
        return [
          ['page open', assignedPageStatement(atelierNordId, userId, ids, 'open', null, 51)],
          ['page closed', assignedPageStatement(atelierNordId, userId, ids, 'closed', null, 51)],
          ['counts of both tabs', stateCountsStatement(atelierNordId, userId, ids)],
          ['Accueil stats', homeStatsStatement(atelierNordId, userId, ids, today)],
          ['seven next tasks', assignedPageStatement(atelierNordId, userId, ids, 'open', null, 7)],
        ];
      }
      const condition = conditionOf(shape, userId, ids);
      return [
        ['page open', pageWith(condition, 'open', 51)],
        ['page closed', pageWith(condition, 'closed', 51)],
        [
          'counts of both tabs',
          sql`select (count(*) filter (where ${isNotClosed()}))::int as "open", (count(*) filter (where ${isClosed()}))::int as "closed" from ${assignedTasksSource()} where ${condition}`,
        ],
        [
          'Accueil stats',
          sql`select (count(*) filter (where ${isNotClosed()}))::int as "assigned", (count(*) filter (where ${isLateOn(today)}))::int as "late", (count(*) filter (where ${isNotClosed()} and ${tasks.dueDate} = ${today}::date))::int as "dueToday", (count(*) filter (where ${hasStatus('done')}))::int as "done" from ${assignedTasksSource()} where ${condition}`,
        ],
        ['seven next tasks', pageWith(condition, 'open', 7)],
      ];
    }

    it('builds the shapes of P3a and PR 1 from the templates of src, so that only the condition differs', () => {
      const dialect = new PgDialect();
      const ids = camilleLists.slice(0, 3);
      const local = (
        state: MyTaskState,
      ): { readonly sql: string; readonly params: readonly unknown[] } =>
        dialect.sqlToQuery(
          pageWith(assignedTasksCondition(atelierNordId, camille.userId, ids), state, 51),
        );
      for (const state of ['open', 'closed'] as const) {
        expect(local(state)).toEqual(
          dialect.sqlToQuery(
            assignedPageStatement(atelierNordId, camille.userId, ids, state, null, 51),
          ),
        );
      }
      const p3a = dialect.sqlToQuery(
        pageWith(conditionOf('a P3a', camille.userId, ids), 'open', 51),
      );
      const pr1 = dialect.sqlToQuery(
        pageWith(conditionOf('b PR 1', camille.userId, ids), 'open', 51),
      );
      expect(p3a.sql).toContain('"tasks"."space_id" = any(');
      expect(pr1.sql).toContain('"tasks"."list_id" = any(');
      expect(pr1.sql).not.toContain('archived_at');
    });

    it('chooses its plan by the number of assignments in every shape: the plans of a, b and c, by default, without sequential scans and as a nested loop, for Camille and the member, with about 1,400 lists and with ten', async () => {
      const people: readonly (readonly [string, string, readonly string[]])[] = [
        ['Camille', camille.userId, camilleLists],
        ['member', memberId, memberLists],
      ];
      const lines: string[] = [];
      const taken: {
        readonly shape: AssignedShape;
        readonly person: string;
        readonly array: string;
        readonly mode: string;
        readonly plan: PlanLine;
      }[] = [];
      for (const [person, userId, visible] of people) {
        const small = await busiestLists(userId, visible);
        const arrays: readonly (readonly [string, readonly string[]])[] = [
          [`${String(visible.length)} lists`, visible],
          [`${String(small.length)} lists`, small],
        ];
        for (const [array, listIds] of arrays) {
          const spaceIds = await spacesOf(listIds);
          for (const shape of ['a P3a', 'b PR 1', 'c PR 2'] as const) {
            const ids = shape === 'a P3a' ? spaceIds : listIds;
            for (const [mode, settings] of plannerModes) {
              for (const [name, statement] of assignedProbes(shape, userId, ids)) {
                const plan = await planOf(
                  `${shape} | ${person} | ${array}${shape === 'a P3a' ? ` (${String(spaceIds.length)} spaces)` : ''} | ${mode} | ${name}`,
                  statement,
                  { settings },
                );
                taken.push({ shape, person, array, mode, plan });
                lines.push(
                  `assigned plan | ${plan.label} | ${plan.nodes.join(' > ')} | tasks rows ${String(plan.rowsRead.tasks ?? 0)}, assignments ${String(plan.rowsRead.task_assignees ?? 0)} | ${String(plan.blocks)} buffers | ${plan.milliseconds.toFixed(3)} ms | cost ${String(plan.cost)} | ${String(plan.rows)} rows`,
                );
              }
            }
          }
        }
      }
      console.info(lines.join('\n'));

      // For each person, array, statement and setting: the join each shape chose, side by side.
      const verdicts: string[] = [];
      for (const entry of taken.filter((item) => item.shape === 'c PR 2')) {
        const name = entry.plan.label.split(' | ').at(-1) ?? '';
        const same = (shape: AssignedShape): PlanLine | undefined =>
          taken.find(
            (item) =>
              item.shape === shape &&
              item.person === entry.person &&
              item.array === entry.array &&
              item.mode === entry.mode &&
              item.plan.label.endsWith(`| ${name}`),
          )?.plan;
        const shapes = [same('a P3a'), same('b PR 1'), entry.plan];
        const tasksScan = (plan: PlanLine | undefined): string =>
          plan === undefined
            ? '?'
            : `${plan.join} ${plan.seqScans.includes('tasks') ? 'Seq Scan tasks' : plan.indexes.filter((index) => index.startsWith('tasks_')).join('+')} ${String(plan.blocks)} buffers ${String(plan.milliseconds)} ms cost ${String(plan.cost)}`;
        verdicts.push(
          `assigned verdict | ${entry.person} | ${entry.array} | ${entry.mode} | ${name} | a ${tasksScan(shapes[0])} | b ${tasksScan(shapes[1])} | c ${tasksScan(shapes[2])}`,
        );
      }
      console.info(verdicts.join('\n'));

      expect(taken).toHaveLength(2 * 2 * 3 * plannerModes.length * 5);
      expect(
        seqScansOf(
          taken.map((item) => item.plan),
          ['task_assignees'],
        ),
      ).toEqual([]);
      // About 100 assignments: no shape reads the whole table; with every list of the member, each
      // shape probes the primary key of tasks once per assignment.
      for (const item of taken.filter((entry) => entry.person === 'member')) {
        expect(
          item.plan.seqScans,
          `${item.plan.label}: ${item.plan.nodes.join(' > ')}`,
        ).not.toContain('tasks');
        if (item.array === `${String(memberLists.length)} lists`) {
          expect(item.plan.indexes, item.plan.label).toContain('tasks_pkey');
        }
      }
      for (const item of taken) {
        expect(item.plan.milliseconds, item.plan.label).toBeLessThan(2_000);
      }
    }, 600_000);
  });

  it('measures what a partial index of the live tasks would change, inside a transaction that is rolled back', async () => {
    const manual: TaskOrder = { key: 'manual', descending: false };
    const firstFifty = await rowsOf<{
      readonly id: string;
      readonly createdAt: string;
      readonly sortValue: string | number | null;
    }>(pageStatement(atelierNordId, largeListId, emptyFilter, manual, null, 50));
    const last = firstFifty.at(-1);
    const after: TaskPosition = {
      sortValue: last?.sortValue ?? null,
      createdAt: new Date(last?.createdAt ?? ''),
      id: last?.id ?? '',
    };
    const archivedLists = await rowsOf<{ readonly id: string }>(
      sql`select id from lists where organization_id = ${atelierNordId} and archived_at is not null order by archived_at desc, id desc limit 51`,
    );
    const probes: readonly (readonly [string, SQL])[] = [
      [
        'large list: page manual',
        pageStatement(atelierNordId, largeListId, emptyFilter, manual, null, 51),
      ],
      [
        'large list: page 2 manual',
        pageStatement(atelierNordId, largeListId, emptyFilter, manual, after, 51),
      ],
      [
        'large list: page -manual',
        pageStatement(
          atelierNordId,
          largeListId,
          emptyFilter,
          { key: 'manual', descending: true },
          null,
          51,
        ),
      ],
      [
        'large list: page manual, level all',
        pageStatement(
          atelierNordId,
          largeListId,
          { ...emptyFilter, rootsOnly: false },
          manual,
          null,
          51,
        ),
      ],
      [
        'large list: page dueDate',
        pageStatement(
          atelierNordId,
          largeListId,
          emptyFilter,
          { key: 'dueDate', descending: false },
          null,
          51,
        ),
      ],
      ['large list: total', countStatement(atelierNordId, largeListId, emptyFilter)],
      [
        'large list: groups status',
        groupStatement(atelierNordId, largeListId, emptyFilter, 'status'),
      ],
      ['large list: list counts', countsOfListsStatement(atelierNordId, [largeListId], today)],
      [
        'Sprint 14: page manual',
        pageStatement(atelierNordId, sprint14Id, emptyFilter, manual, null, 51),
      ],
      [
        'Sprint 14: page dueDate',
        pageStatement(
          atelierNordId,
          sprint14Id,
          emptyFilter,
          { key: 'dueDate', descending: false },
          null,
          51,
        ),
      ],
      ['Sprint 14: total', countStatement(atelierNordId, sprint14Id, emptyFilter)],
      [
        'Sprint 14: groups status',
        groupStatement(atelierNordId, sprint14Id, emptyFilter, 'status'),
      ],
      ['Sprint 14: list counts', countsOfListsStatement(atelierNordId, [sprint14Id], today)],
      [
        'archived lists: live top-level tasks',
        liveRootCountsStatement(
          atelierNordId,
          archivedLists.map((row) => row.id),
        ),
      ],
      [
        'Mes tâches: page open of Camille',
        assignedPageStatement(atelierNordId, camille.userId, camilleLists, 'open', null, 51),
      ],
      [
        'Mes tâches: counts of Camille',
        stateCountsStatement(atelierNordId, camille.userId, camilleLists),
      ],
      [
        'Accueil: stats of Camille',
        homeStatsStatement(atelierNordId, camille.userId, camilleLists, today),
      ],
      [
        'Mes tâches: page open of the member',
        assignedPageStatement(atelierNordId, memberId, memberLists, 'open', null, 51),
      ],
      [
        'Mes tâches: counts of the member',
        stateCountsStatement(atelierNordId, memberId, memberLists),
      ],
    ];
    const candidates: readonly (readonly [string, string])[] = [
      [
        'A (organization_id, list_id, created_at, id) where archived_at is null',
        'create index tasks_live_list_created_candidate on tasks (organization_id, list_id, created_at, id) where archived_at is null',
      ],
      [
        'B (organization_id, id) where archived_at is null',
        'create index tasks_live_candidate on tasks (organization_id, id) where archived_at is null',
      ],
    ];

    // The migrator owns the tables and alone may create an index; its session carries the policy of
    // the application role (the organization of the transaction, no system access), since row-level
    // security is forced for the owner too. The plans without and with each candidate come from the
    // same session, so the only difference is the index.
    const client = await migrator.connect();
    const take = async (): Promise<PlanLine[]> => {
      const taken: PlanLine[] = [];
      for (const [label, statement] of probes) {
        const query = new PgDialect().sqlToQuery(statement);
        const text = `explain (analyze, buffers, format json) ${query.sql}`;
        await client.query(text, query.params);
        const result = await client.query<{ readonly 'QUERY PLAN': readonly PlanDocument[] }>(
          text,
          query.params,
        );
        const document = result.rows[0]?.['QUERY PLAN'][0];
        if (document === undefined) {
          throw new Error(`No plan for ${label}.`);
        }
        taken.push(summarize(label, document));
      }
      return taken;
    };
    const baseline: PlanLine[] = [];
    const withCandidate: PlanLine[][] = [];
    try {
      await client.query('begin');
      await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
        'app.organization_id',
        atelierNordId,
        'app.system_access',
        'off',
      ]);
      baseline.push(...(await take()));
      for (const [, ddl] of candidates) {
        await client.query('savepoint candidate');
        await client.query(ddl);
        withCandidate.push(await take());
        await client.query('rollback to savepoint candidate');
      }
    } finally {
      await client.query('rollback');
      client.release();
    }
    const [leftover] = (
      await migrator.query<{ readonly count: number }>(
        `select count(*)::int as count from pg_indexes where indexname like 'tasks_live%candidate'`,
      )
    ).rows;

    const cell = (plan: PlanLine | undefined): string =>
      plan === undefined
        ? '?'
        : `${plan.indexes.join(', ') || plan.seqScans.join(', ')} ${String(plan.blocks)} buffers ${plan.milliseconds.toFixed(3)} ms`;
    const lines = probes.map(
      ([label], index) =>
        `partial index | ${label} | without: ${cell(baseline[index])} | ${candidates
          .map(
            ([name], candidate) =>
              `${name.slice(0, 1)}: ${cell(withCandidate[candidate]?.[index])}`,
          )
          .join(' | ')}`,
    );
    console.info(`Candidates: ${candidates.map(([name]) => name).join('; ')}\n${lines.join('\n')}`);
    for (const [name] of candidates) {
      const index = candidates.findIndex(([candidate]) => candidate === name);
      const used = (withCandidate[index] ?? []).filter((plan) =>
        plan.indexes.some((entry) => entry.startsWith('tasks_live')),
      );
      console.info(
        `partial index | candidate ${name} used by: ${used.map((plan) => plan.label).join(', ') || 'none'}`,
      );
    }

    expect(baseline).toHaveLength(probes.length);
    expect(withCandidate.map((plans) => plans.length)).toEqual([probes.length, probes.length]);
    expect(leftover?.count).toBe(0);
  }, 600_000);

  it('reports the indexes the plans named', () => {
    const used = new Set(everyPlan.flatMap((plan) => plan.indexes));
    console.info(
      `archive plans: ${String(everyPlan.length)} plans as task_app on a tasks table of ${String(tasksBlocks)} blocks; indexes named: ${[...used].sort().join(', ')}`,
    );
    expect(used).toContain('tasks_archive_root_index');
    expect(used).toContain('tasks_archive_member_index');
    expect(used).toContain('lists_organization_archived_index');
  });

  describe('deploying migrations/0006_archives.sql holds tasks and lists while it scans them', () => {
    it('runs the statements of 0006 again under temporary names, as the migrator, in a transaction rolled back: the time of each and of all, and the locks it holds on tasks and lists', async () => {
      const statements = readFileSync(archivesMigration, 'utf8')
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter((statement) => statement !== '');
      // Every column, constraint and index 0006 introduces gets a temporary name: the columns are
      // added empty, as on the day of the deploy, beside the ones the seed filled.
      const introduced = new Set(
        statements.flatMap((statement) =>
          [...statement.matchAll(/(?:ADD COLUMN|ADD CONSTRAINT|CREATE INDEX) "([a-z_]+)"/gu)].map(
            (match) => match[1] ?? '',
          ),
        ),
      );
      const probes = statements.map((statement) =>
        statement.replace(/"([a-z_]+)"/gu, (quoted: string, name: string) =>
          introduced.has(name) ? `"${name}_probe"` : quoted,
        ),
      );
      expect(statements).toHaveLength(20);
      expect(introduced.size).toBe(6 + 8 + 3);
      expect(probes.filter((probe, index) => probe === statements[index])).toEqual([]);
      const [volume] = await asSystem<{ readonly tasks: number; readonly lists: number }>(
        'select (select count(*)::int from tasks) as tasks, (select count(*)::int from lists) as lists',
      );

      const client = await migrator.connect();
      const timings: { readonly statement: string; readonly milliseconds: number }[] = [];
      const replay = async (): Promise<{
        readonly total: number;
        readonly locks: readonly { readonly relation: string; readonly mode: string }[];
      }> => {
        await client.query('begin');
        const started = performance.now();
        for (const probe of probes) {
          const before = performance.now();
          await client.query(probe);
          timings.push({
            statement: probe.replace(/\s+/gu, ' ').slice(0, 140),
            milliseconds: Math.round((performance.now() - before) * 10) / 10,
          });
        }
        const elapsed = Math.round(performance.now() - started);
        const held = await client.query<{ readonly relation: string; readonly mode: string }>(
          `select relation::regclass::text as relation, mode from pg_locks
            where pid = pg_backend_pid() and locktype = 'relation' and granted
              and relation in ('tasks'::regclass, 'lists'::regclass)
            order by relation::regclass::text, mode`,
        );
        return { total: elapsed, locks: held.rows };
      };
      let replayed: Awaited<ReturnType<typeof replay>>;
      try {
        replayed = await replay();
      } finally {
        await client.query('rollback');
        client.release();
      }
      const { total, locks } = replayed;
      const [leftover] = await asSystem<{ readonly columns: number; readonly indexes: number }>(
        `select (select count(*)::int from information_schema.columns
                  where table_name in ('tasks', 'lists') and column_name like '%\\_probe') as columns,
                (select count(*)::int from pg_indexes where indexname like '%\\_probe') as indexes`,
      );

      console.info(
        [
          `migration 0006 on ${String(volume?.tasks ?? 0)} tasks and ${String(volume?.lists ?? 0)} lists: ${String(total)} ms in all`,
          ...timings.map(
            (timing) =>
              `migration 0006 | ${timing.milliseconds.toFixed(1)} ms | ${timing.statement}`,
          ),
          `migration 0006 | locks held until the commit: ${locks.map((lock) => `${lock.relation} ${lock.mode}`).join(', ')}`,
        ].join('\n'),
      );
      expect(volume?.tasks).toBeGreaterThan(100_000);
      expect(volume?.lists).toBeGreaterThan(4_000);
      expect(timings).toHaveLength(statements.length);
      expect(total).toBeLessThan(60_000);
      for (const relation of ['tasks', 'lists']) {
        expect(
          locks.filter((lock) => lock.relation === relation).map((lock) => lock.mode),
          relation,
        ).toContain('AccessExclusiveLock');
      }
      expect(leftover).toEqual({ columns: 0, indexes: 0 });
    }, 300_000);
  });
});
