import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DrizzleAccessRequestRepository } from '../src/modules/access-requests/infrastructure/persistence/drizzle/repositories/access-request/drizzle-access-request.repository.js';
import { listRoleAsIfNotDeletedOf } from '../src/modules/spaces/domain/policies/access/access-role.policy.js';
import type { DroppedRequestTarget } from '../src/modules/access-requests/application/models/access-request/dropped-request-target.model.js';
import type { Viewer } from '../src/modules/spaces/domain/value-objects/member/viewer.value-object.js';
import { DrizzleGrantRepository } from '../src/modules/spaces/infrastructure/persistence/drizzle/repositories/access/drizzle-grant.repository.js';
import { DrizzleTaskListRepository } from '../src/modules/spaces/infrastructure/persistence/drizzle/repositories/list/drizzle-task-list.repository.js';
import { DrizzleSpaceRepository } from '../src/modules/spaces/infrastructure/persistence/drizzle/repositories/space/drizzle-space.repository.js';
import type { ArchivePosition } from '../src/modules/tasks/application/models/archive/archive-position.model.js';
import type { TaskFilter } from '../src/modules/tasks/application/models/query/task-filter.model.js';
import type { TaskOrder } from '../src/modules/tasks/application/models/query/task-order.model.js';
import type { TrashPosition } from '../src/modules/tasks/application/models/trash/trash-position.model.js';
import type { TaskPosition } from '../src/modules/tasks/application/models/query/task-position.model.js';
import type { TasksStore } from '../src/modules/tasks/application/models/transactions/tasks-store.model.js';
import type { TrashEntryDraft } from '../src/modules/tasks/application/models/trash/trash-entry-draft.model.js';
import type { TrashEntryRecord } from '../src/modules/tasks/application/models/trash/trash-entry-record.model.js';
import type { SpaceDirectory } from '../src/modules/tasks/application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../src/modules/tasks/application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { PurgeTrashBatch } from '../src/modules/tasks/application/use-cases/commands/trash/purge-trash-batch/purge-trash-batch.use-case.js';
import { TrashDeletedListTasks } from '../src/modules/tasks/application/use-cases/commands/trash/trash-deleted-list-tasks/trash-deleted-list-tasks.use-case.js';
import type { Task } from '../src/modules/tasks/domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../src/modules/tasks/domain/value-objects/task/task-key.value-object.js';
import { PostgresqlTransactionClock } from '../src/modules/tasks/infrastructure/adapters/postgresql/transaction-clock.adapter.js';
import { OutboxTaskEvents } from '../src/modules/tasks/infrastructure/messaging/outbox/task/outbox-task-events.adapter.js';
import {
  archivedRootsCountStatement,
  archivedRootsPageStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/archive/archive-statements.mapper.js';
import {
  countStatement,
  groupStatement,
  pageStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/query/task-query-statements.mapper.js';
import { countsOfListsStatement } from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/count/task-counts.mapper.js';
import {
  dueEntriesStatement,
  eraseEntriesStatements,
  handedOverEntriesStatement,
  organizationsWithTrashStatement,
  requestPurgeStatement,
  listsWithTasksStatement,
  trashCandidateRootsStatement,
  trashPageStatement,
  trashTotalStatement,
  writeTrashStatement,
} from '../src/modules/tasks/infrastructure/persistence/drizzle/mappers/trash/trash-statements.mapper.js';
import { DrizzleActivityRepository } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/activity/drizzle-activity.repository.js';
import { DrizzleArchiveReader } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/archive/drizzle-archive-reader.repository.js';
import { DrizzleAssignedTaskReader } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/assignee/drizzle-assigned-task-reader.repository.js';
import { DrizzleTaskCounter } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/count/drizzle-task-counter.repository.js';
import { DrizzleLabelReader } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/label/drizzle-label-reader.repository.js';
import { DrizzleTaskQueryReader } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/query/drizzle-task-query-reader.repository.js';
import { DrizzleTaskReader } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/task/drizzle-task-reader.repository.js';
import { DrizzleTaskRepository } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/task/drizzle-task.repository.js';
import { DrizzleTrashEntryRepository } from '../src/modules/tasks/infrastructure/persistence/drizzle/repositories/trash/drizzle-trash-entry.repository.js';

// The plans of the statements the trash, the purge and the deletion of lists and spaces of P3b-1
// (PR 3) added or changed, on a disposable PostgreSQL started from compose.dev.yaml as a throwaway
// Compose project on free ports, migrated by `src/migrate.ts` as the migrator role, as
// tests/archive-queries.int-spec.ts does. Only PostgreSQL runs: the statements are built by the
// exported builders of `src` or captured from the repositories and the use cases of `src` through
// the Drizzle logger, so no route, no NATS and no Nest application is needed. Every plan is
// `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` as `task_app` (the system access for the scan of the
// organizations) in a transaction of the organization (the settings the tenant runner of the kit
// sets, row-level security forced). A read is run once to warm the cache and explained again; a
// write is run in a savepoint that is rolled back, to warm the cache and to capture its statements,
// then explained once in the restored state, the statements of a sequence in their order. Every
// transaction is rolled back.
//
// Atelier Nord holds about 90,000 tasks and about 20,000 trash entries: the 3,000 lists of 300
// spaces of tests/archive-queries.int-spec.ts (21 tasks each in trees of three levels, one in five
// archived, 60 lists deleted, three entries of the first three top-level tasks of every list), a
// list of 20,000 tasks whose oldest 12,000 trees (15,000 tasks, some archived: an archived task
// keeps its archive in the trash) are in the trash and which is itself deleted, a deleted list of
// 6,600 tasks the deletion job has not moved yet, an entry of 651 tasks (its tasks with assignees,
// labels, checklist items and activity) with four entries of children it detaches, an entry of one
// task, a space of 1,000 lists, three deleted spaces with their grants, 5,000 pending access
// requests from 300 requesters, and some entries handed over by "Vider la corbeille" or 31 days
// old. A second organization holds 21,000 tasks, 3,000 entries (a third due, an entry of 651 tasks
// the oldest due); a third holds 100,000 entries of one task each; 500 more organizations hold 40
// entries each, a few of them due or handed over. The plans and timings are printed for the report
// of the pull request (the minimal reporter of Vitest shows the logs of failed tests only: run with
// `--silent=false` to read them); the assertions keep to what is stable: no Seq Scan of `tasks`
// where an index serves, the index that serves, and generous time bounds.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** The migration of the trash, whose deploy-time cost is measured on the seeded tables. */
const trashMigration: string = fileURLToPath(
  new URL('../migrations/0007_trash.sql', import.meta.url),
);

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-trash-plans-test-${String(process.pid)}`;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** A second organization, with entries to purge. */
const atelierDeltaId = '01938f6e-0000-7000-8000-000000000002';

/** A third organization, whose trash holds 100,000 entries. */
const corbeilleId = '01938f6e-0000-7000-8000-000000000003';

/** Camille Martin (CM), owner of Atelier Nord. */
const camille = { userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24' } as const;

/** Inès Robert (IR), admin of Atelier Nord. */
const ines = { userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c25' } as const;

/** Solène Garnier, owner of the second organization. */
const solene = { userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c29' } as const;

/** Tasks of a seeded list: 12 top-level, 6 subtasks of the first six, 3 under the first three. */
const TASKS_PER_LIST = 21;

/** Top-level tasks and subtasks of the large list, and how many of its oldest trees are in the trash. */
const LARGE_LIST = { tops: 16_000, subtasks: 4_000, trashedTops: 12_000 } as const;

/** Trees of the deleted list the deletion job has not moved yet: 11 tasks each. */
const DELETED_LIST_TREES = 600;

/** Entries of the third organization, and of its lists. */
const CORBEILLE = { entries: 100_000, lists: 100 } as const;

/** Organizations that only hold entries, for the scan of the organizations. */
const ENTRY_ORGANIZATIONS = 500;

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

/** The date of the caller: the one of the examples of the contract. */
const today = '2026-11-08';

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
  readonly 'Rows Removed by Filter'?: number;
  readonly 'Heap Fetches'?: number;
  readonly Plans?: readonly PlanNode[];
}

/** A foreign key check or trigger a statement fired, as `EXPLAIN ANALYZE` reports it. */
interface PlanTrigger {
  readonly 'Trigger Name': string;
  readonly 'Constraint Name'?: string;
  readonly Relation?: string;
  readonly Time: number;
  readonly Calls: number;
}

/** The document `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` returns for one statement. */
interface PlanDocument {
  readonly Plan: PlanNode;
  readonly 'Execution Time': number;
  readonly Triggers?: readonly PlanTrigger[];
}

/** What the report keeps of one plan. */
interface PlanLine {
  readonly label: string;
  readonly nodes: readonly string[];
  readonly indexes: readonly string[];
  readonly seqScans: readonly string[];
  /** Rows the scans of each table returned, over all their loops. */
  readonly rowsRead: Readonly<Record<string, number>>;
  /** Rows the scans of each table dropped after reading them, over all their loops. */
  readonly removed: Readonly<Record<string, number>>;
  /** For each scan, the rows the planner estimated and those it found, per loop. */
  readonly estimates: readonly string[];
  /** The foreign key checks the statement fired: constraint, total time, calls. */
  readonly triggers: readonly string[];
  readonly triggerMilliseconds: number;
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
interface MeasureOptions {
  /** How many of the captured statements to plan, all of them by default. */
  readonly keep?: number;
  /** Planner settings for the transaction (`set local`). */
  readonly settings?: readonly string[];
  /** `true` for statements that write: run in a savepoint, explained once in the restored state. */
  readonly write?: boolean;
  /** The organization of the transaction, Atelier Nord by default. */
  readonly organizationId?: string;
  /** The pool of the session: `task_app` by default, the migrator for a candidate index. */
  readonly migrator?: boolean;
  /** Runs before the statements, in the transaction, outside the savepoint (a candidate index). */
  readonly prepare?: (client: pg.PoolClient) => Promise<void>;
}

/** The ranks of a seeded organization, for the requests and the lists. */
interface SeededOrganization {
  readonly id: string;
  readonly volumeAccounts: readonly string[];
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
  const rowsRead: Record<string, number> = {};
  const removed: Record<string, number> = {};
  const estimates: string[] = [];
  visitPlan(document.Plan, (node) => {
    const relation = node['Relation Name'];
    const index = node['Index Name'];
    const loops = node['Actual Loops'] ?? 1;
    if (relation !== undefined || index !== undefined) {
      estimates.push(
        `${index ?? relation ?? ''} ${String(node['Plan Rows'] ?? 0)}/${String(Math.round(node['Actual Rows'] ?? 0))}${loops > 1 ? ` x${String(loops)}` : ''}`,
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
    if (relation !== undefined) {
      rowsRead[relation] = Math.round(
        (rowsRead[relation] ?? 0) + (node['Actual Rows'] ?? 0) * loops,
      );
      removed[relation] = Math.round(
        (removed[relation] ?? 0) + (node['Rows Removed by Filter'] ?? 0) * loops,
      );
    }
  });
  const triggers = (document.Triggers ?? []).map(
    (trigger) =>
      `${trigger['Constraint Name'] ?? trigger['Trigger Name']} ${trigger.Time.toFixed(3)} ms x${String(trigger.Calls)}`,
  );
  return {
    label,
    nodes,
    indexes: [...indexes],
    seqScans,
    rowsRead,
    removed,
    estimates,
    triggers,
    triggerMilliseconds: (document.Triggers ?? []).reduce(
      (total, trigger) => total + trigger.Time,
      0,
    ),
    blocks: (document.Plan['Shared Hit Blocks'] ?? 0) + (document.Plan['Shared Read Blocks'] ?? 0),
    milliseconds: Math.round(document['Execution Time'] * 1000) / 1000,
    cost: Math.round(document.Plan['Total Cost'] ?? 0),
    rows: document.Plan['Actual Rows'] ?? 0,
  };
}

/**
 * One line of the report for a plan.
 *
 * @param plan - The plan.
 * @returns The line.
 */
function lineOf(plan: PlanLine): string {
  const removed = Object.entries(plan.removed).filter(([, rows]) => rows > 0);
  return `trash plan | ${plan.label} | ${plan.nodes.join(' > ')} | indexes ${plan.indexes.join(', ') || 'none'} | ${String(plan.blocks)} shared buffers | ${plan.milliseconds.toFixed(3)} ms | cost ${String(plan.cost)} | ${String(plan.rows)} rows | scan rows estimated/actual: ${plan.estimates.join(', ')}${removed.length === 0 ? '' : ` | removed by filter: ${removed.map(([table, rows]) => `${table} ${String(rows)}`).join(', ')}`}${plan.triggers.length === 0 ? '' : ` | triggers: ${plan.triggers.join(', ')}`}`;
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
 * Turns a statement of a builder into text and parameters.
 *
 * @param statement - The statement.
 * @returns Its text and parameters.
 */
function queryOf(statement: SQL): CapturedStatement {
  const query = new PgDialect().sqlToQuery(statement);
  return { sql: query.sql, params: query.params };
}

describe('the trash, the purge and the deletion of lists and spaces keep their statements on their indexes', () => {
  let migrator: pg.Pool;
  let application: pg.Pool;

  // What the seed creates and the scenarios read, in the order of the file.
  let produitId = '';
  let largeSpaceId = '';
  let largeListId = '';
  let bigListId = '';
  let deletedListId = '';
  let milleSpaceId = '';
  let oldSpaceIds: readonly string[] = [];
  let oldListIds: readonly string[] = [];
  let tasksBlocks = 0;
  let corbeilleLists: readonly string[] = [];
  /** The lists Camille, the admin, the member and the guest may restore the entries of. */
  let ownerLists: readonly string[] = [];
  let adminLists: readonly string[] = [];
  let memberLists: readonly string[] = [];
  let guestLists: readonly string[] = [];
  /** Two lists of the volume with their three entries each: a caller with edit on two lists. */
  let twoLists: readonly string[] = [];
  /** Every list of Atelier Nord, whatever its state: a caller who may restore them all. */
  let allLists: readonly string[] = [];
  /** A deleted list of Atelier Delta whose 20,000 tasks are all in the trash, one entry each. */
  let fullTrashListId = '';
  /** The ids of the entries the erasure and the locks measure. */
  let bigEntryId = '';
  let oneEntryId = '';
  let bigTaskIds: readonly string[] = [];
  /** Every plan taken, for the summary at the end. */
  const everyPlan: PlanLine[] = [];

  // The accounts of the volume: the first 300 own the spaces, 300 to 499 receive the grants of
  // spaces, all receive grants of lists (tests/access.int-spec.ts). The member is the 302nd, the
  // guest the 452nd.
  const accounts: readonly string[] = Array.from({ length: 500 }, () => randomUUID());
  const memberId: string = accounts[301] ?? '';
  const guestId: string = accounts[451] ?? '';
  const asOwner: Viewer = { userId: camille.userId, role: 'owner' };
  const asAdmin: Viewer = { userId: ines.userId, role: 'admin' };
  const asMember: Viewer = { userId: memberId, role: 'member' };
  const asGuest: Viewer = { userId: guestId, role: 'guest' };
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
   * Runs work in a transaction of one organization as `task_app` (the settings the tenant runner of
   * the kit sets: the organization, no system access) or, for a candidate index, as the migrator
   * with the same settings, then rolls it back.
   *
   * @param work - The work, with the Drizzle database of the transaction and its client.
   * @param options - The organization, the planner settings and which role.
   * @param captured - Receives every statement the work sends, as the Drizzle logger sees it.
   * @returns What the work returns.
   */
  async function inTenant<TResult>(
    work: (db: TransactionDatabase, client: pg.PoolClient) => Promise<TResult>,
    options: Pick<MeasureOptions, 'organizationId' | 'settings' | 'migrator' | 'prepare'> = {},
    captured: CapturedStatement[] = [],
  ): Promise<TResult> {
    const client = await (options.migrator === true ? migrator : application).connect();
    try {
      await client.query('begin');
      await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
        'app.organization_id',
        options.organizationId ?? atelierNordId,
        'app.system_access',
        'off',
      ]);
      for (const setting of options.settings ?? []) {
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
      await options.prepare?.(client);
      return await work(db, client);
    } finally {
      await client.query('rollback');
      client.release();
    }
  }

  /**
   * Explains a statement as it stands: the first run of a read warms the cache.
   *
   * @param client - The session.
   * @param statement - The statement and its parameters.
   * @param warm - `true` to run it once before (a read).
   * @returns The plan.
   */
  async function explain(
    client: pg.PoolClient,
    statement: CapturedStatement,
    warm: boolean,
  ): Promise<PlanDocument> {
    const text = `explain (analyze, buffers, format json) ${statement.sql}`;
    if (warm) {
      await client.query(text, statement.params);
    }
    const result = await client.query<{ readonly 'QUERY PLAN': readonly PlanDocument[] }>(
      text,
      statement.params,
    );
    const document = result.rows[0]?.['QUERY PLAN'][0];
    if (document === undefined) {
      throw new Error(`No plan for ${statement.sql.slice(0, 80)}.`);
    }
    return document;
  }

  /**
   * Runs work of the repositories in a transaction, records every statement it sends and takes the
   * plan of the first `keep` of them, then rolls back. A read is explained after a first run that
   * warms the cache. A write runs in a savepoint that is rolled back first, which warms the cache
   * and captures its statements, and is explained once in the restored state, in order.
   *
   * @param label - What the work is.
   * @param work - The calls of the repositories, or statements run through `db.execute`.
   * @param options - How many statements to plan, the settings, and whether the work writes.
   * @returns One line per statement planned.
   */
  async function measure(
    label: string,
    work: (db: TransactionDatabase) => Promise<unknown>,
    options: MeasureOptions = {},
  ): Promise<PlanLine[]> {
    const captured: CapturedStatement[] = [];
    const keep = options.keep ?? Number.POSITIVE_INFINITY;
    const write = options.write === true;
    const lines = await inTenant(
      async (db, client) => {
        if (write) {
          await client.query('savepoint measured_write');
        }
        await work(db);
        if (write) {
          await client.query('rollback to savepoint measured_write');
        }
        const planned = captured.slice(0, keep);
        const taken: PlanLine[] = [];
        for (const [index, statement] of planned.entries()) {
          const document = await explain(client, statement, !write);
          taken.push(
            summarize(planned.length === 1 ? label : `${label} (${String(index + 1)})`, document),
          );
        }
        return taken;
      },
      options,
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
   * @param options - The settings and the organization.
   * @returns The plan.
   */
  async function planOf(
    label: string,
    statement: SQL,
    options: MeasureOptions = {},
  ): Promise<PlanLine> {
    const [line] = await measure(label, (db) => db.execute(statement), { ...options, keep: 1 });
    if (line === undefined) {
      throw new Error(`No plan for ${label}.`);
    }
    return line;
  }

  /**
   * Runs one statement built by a builder of `src` in a transaction of an organization and returns
   * its rows.
   *
   * @param statement - The statement.
   * @param organizationId - The organization, Atelier Nord by default.
   * @returns Its rows.
   */
  async function rowsOf<TRow extends pg.QueryResultRow>(
    statement: SQL,
    organizationId: string = atelierNordId,
  ): Promise<TRow[]> {
    const query = new PgDialect().sqlToQuery(statement);
    return inTenant(
      async (_db, client) => (await client.query<TRow>(query.sql, query.params)).rows,
      {
        organizationId,
      },
    );
  }

  /**
   * The lists a member may restore the entries of: those the viewer would have `edit` on as if
   * neither the list nor its space were deleted, as `ListTrashLists` of spaces and the page of the
   * trash compute them.
   *
   * @param viewer - The member and its role.
   * @param organizationId - The organization.
   * @returns The ids of the lists.
   */
  async function editableLists(viewer: Viewer, organizationId: string): Promise<string[]> {
    return inTenant(
      async (db) => {
        const rows = await new DrizzleTaskListRepository(db).listTrashAccessesVisibleTo(
          organizationId,
          viewer,
        );
        return rows
          .filter(
            (row) =>
              listRoleAsIfNotDeletedOf(
                row.space,
                { organizationAccess: row.organizationAccess },
                viewer,
                row.grants,
              ) === 'edit',
          )
          .map((row) => row.listId);
      },
      { organizationId },
    );
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
   * Seeds an activity entry for every task of the volume and two checklist items for one in four,
   * the collections an erasure deletes.
   *
   * @param organizationId - The organization.
   */
  async function seedVolumeCollections(organizationId: string): Promise<void> {
    await asSystem(
      `insert into activity_entries (organization_id, task_id, list_id, kind, actor_type, actor_id, occurred_at)
       select t.organization_id, t.id, t.list_id, 'create', 'user', t.created_by_id, t.created_at
         from tasks as t where t.organization_id = $1 and t.key_prefix = 'VOL'`,
      [organizationId],
    );
    await asSystem(
      `insert into checklist_items (organization_id, task_id, text, done, position)
       select t.organization_id, t.id, 'Étape ' || p, p = 0, p
         from tasks as t cross join generate_series(0, 1) as p
        where t.organization_id = $1 and t.key_prefix = 'VOL' and t.key_number % 4 = 0`,
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
   * Archives one task in five of the seeded lists of an organization, as tests/archive-queries
   * does, and two lists in a hundred; and deletes one list in fifty (60 of 3,000, no task moved yet).
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
    await asSystem(
      `update lists as li
          set deleted_at = now() - interval '3 days' + make_interval(mins => l.rank::int),
              deleted_by_type = 'user', deleted_by_id = l.owner_user_id::text
         from ${seededLists} as l
        where li.organization_id = $1 and li.id = l.id and l.rank % 50 = 7`,
      [organizationId],
    );
  }

  /**
   * Moves trees to the trash as `TrashTask` does, one entry per root, in one statement: every member
   * of a tree not in the trash already, archived ones included (an archived task keeps its archive),
   * gets the entry; the entry gets the size of its tree. The roots are `select id, list_id,
   * created_by_id, parent_key` over `tasks as t`.
   *
   * @param organizationId - The organization, `$1` of `roots`.
   * @param roots - The select of the roots.
   * @param params - The parameters of `roots` after `$1`.
   * @param trashedAt - The SQL expression of the instant of an entry, over `r` and `rn`.
   * @returns How many entries were created.
   */
  async function trashTrees(
    organizationId: string,
    roots: string,
    params: readonly unknown[],
    trashedAt: string,
  ): Promise<number> {
    const rows = await asSystem<{ readonly entries: number }>(
      `with recursive roots as (${roots}),
       members (id, root_id) as (
         select id, id from roots
         union all
         select child.id, members.root_id
           from members join tasks as child
             on child.organization_id = $1 and child.parent_id = members.id and child.trash_entry_id is null
       ),
       sizes as (select root_id, count(*)::int as size from members group by root_id),
       created as (
         insert into trash_entries (organization_id, root_task_id, list_id, parent_key, task_count,
                                    trashed_at, trashed_by_type, trashed_by_id)
         select $1::uuid, r.id, r.list_id, r.parent_key, s.size, ${trashedAt}, 'user', r.created_by_id
           from (select roots.*, row_number() over (order by roots.id) as rn from roots) as r
           join sizes as s on s.root_id = r.id
         returning id, root_task_id
       ),
       moved as (
         update tasks as t set trash_entry_id = created.id
           from members join created on created.root_task_id = members.root_id
          where t.organization_id = $1 and t.id = members.id
         returning t.id
       )
       select (select count(*)::int from created) as entries, (select count(*)::int from moved) as moved`,
      [organizationId, ...params],
    );
    return rows[0]?.entries ?? 0;
  }

  /**
   * Gives some entries of an organization to the purge: one in `every` is handed over by "Vider la
   * corbeille" (a user, an hour ago), another one in `every` is 31 days old, picked by a hash of the
   * id; the entries of `except` are left alone.
   *
   * @param organizationId - The organization.
   * @param every - The modulus of the entries.
   * @param withHandedOver - `false` to leave out the entries handed over.
   * @param except - A list whose entries are left alone.
   */
  async function ageEntries(
    organizationId: string,
    every: number,
    withHandedOver: boolean,
    except: string,
  ): Promise<void> {
    // Chosen by a hash of the id: one pass over the entries of the organization, no self join.
    if (withHandedOver) {
      await asSystem(
        `update trash_entries
            set purge_requested_at = now() - interval '1 hour' + make_interval(secs => abs(hashtext(id::text)) % 3000),
                purge_requested_by_type = 'user', purge_requested_by_id = $4
          where organization_id = $1 and list_id <> $3::uuid and abs(hashtext(id::text)) % $2::int = 0`,
        [organizationId, every, except, camille.userId],
      );
    }
    await asSystem(
      `update trash_entries
          set trashed_at = now() - interval '31 days' - make_interval(secs => abs(hashtext(id::text)) % 100000)
        where organization_id = $1 and list_id <> $3::uuid and abs(hashtext(id::text)) % $2::int = 1
          and purge_requested_at is null`,
      [organizationId, every, except],
    );
  }

  /**
   * Seeds a space with its lists in an organization, returning the ids.
   *
   * @param organizationId - The organization.
   * @param name - The name of the space.
   * @param prefix - Its key prefix.
   * @param ownerId - Its owner.
   * @param lists - The names of its lists.
   * @returns The space and its lists, by name.
   */
  async function seedSpace(
    organizationId: string,
    name: string,
    prefix: string,
    ownerId: string,
    lists: readonly string[],
  ): Promise<{ readonly spaceId: string; readonly listIds: Readonly<Record<string, string>> }> {
    const [space] = await asSystem<{ readonly id: string }>(
      `insert into spaces (organization_id, name, prefix, color, visibility, owner_user_id, statuses, created_at)
       values ($1, $2, $3, 'gris', 'organization', $4, '{}'::jsonb, timestamptz '2026-01-01 08:00+00')
       returning id::text as id`,
      [organizationId, name, prefix, ownerId],
    );
    const created = await asSystem<{ readonly id: string; readonly name: string }>(
      `insert into lists (organization_id, space_id, name, color, created_at)
       select $1, $2, n, 'gris', timestamptz '2026-01-01 08:00+00' + make_interval(secs => k)
         from unnest($3::text[]) with ordinality as l (n, k)
       returning id::text as id, name`,
      [organizationId, space?.id ?? '', lists],
    );
    return {
      spaceId: space?.id ?? '',
      listIds: Object.fromEntries(created.map((row) => [row.name, row.id])),
    };
  }

  /**
   * Seeds the biggest valid entry of the trash: a task with 25 subtasks of 25 subtasks each (651
   * tasks), each with two assignees, two labels, three checklist items and three activity entries,
   * and four tasks outside it whose parent is one of its tasks, trashed before in entries of their
   * own; then one entry of a single task with its own collections.
   *
   * @param organization - The organization and its accounts.
   * @param spaceId - The space of the list.
   * @param listId - The list.
   * @param trashedAt - The instant of the big entry.
   * @returns The ids of the big entry, of the single one, and of the 651 tasks.
   */
  async function seedBigEntry(
    organization: SeededOrganization,
    spaceId: string,
    listId: string,
    trashedAt: string,
  ): Promise<{ readonly big: string; readonly one: string; readonly tasks: readonly string[] }> {
    const insertTasks = `insert into tasks (organization_id, space_id, list_id, parent_id, key_prefix, key_number, name,
                                            status, priority, created_at, created_by_type, created_by_id)`;
    await asSystem(
      `${insertTasks}
       select $1, $2, $3, null, 'BIG', 1, 'Refonte de l’authentification', 'progress', 'haute',
              timestamptz '2026-02-01 08:00+00', 'user', $4`,
      [organization.id, spaceId, listId, camille.userId],
    );
    await asSystem(
      `${insertTasks}
       select $1, $2, $3, p.id, 'BIG', 1 + n, 'Lot ' || n, 'todo', 'moyenne',
              timestamptz '2026-02-01 08:00+00' + make_interval(secs => n), 'user', $4
         from tasks as p cross join generate_series(1, 25) as n
        where p.organization_id = $1 and p.key_prefix = 'BIG' and p.key_number = 1`,
      [organization.id, spaceId, listId, camille.userId],
    );
    await asSystem(
      `${insertTasks}
       select $1, $2, $3, p.id, 'BIG', 26 + (p.key_number - 2) * 25 + n, 'Lot ' || (p.key_number - 1) || '.' || n,
              'todo', 'basse', timestamptz '2026-02-01 08:00+00' + make_interval(secs => 100 + p.key_number * 30 + n),
              'user', $4
         from tasks as p cross join generate_series(1, 25) as n
        where p.organization_id = $1 and p.key_prefix = 'BIG' and p.key_number between 2 and 26`,
      [organization.id, spaceId, listId, camille.userId],
    );
    // Four tasks outside the entry whose parent is one of its tasks: trashed before, in entries of
    // their own, as an erasure of the big entry must detach them.
    await asSystem(
      `${insertTasks}
       select $1, $2, $3, p.id, 'BIG', 700 + n, 'Sous-tâche supprimée avant ' || n, 'todo', 'basse',
              timestamptz '2026-02-02 08:00+00' + make_interval(secs => n), 'user', $4
         from tasks as p cross join generate_series(1, 4) as n
        where p.organization_id = $1 and p.key_prefix = 'BIG' and p.key_number = 2`,
      [organization.id, spaceId, listId, camille.userId],
    );
    await asSystem(
      `${insertTasks}
       select $1, $2, $3, null, 'ONE', 1, 'Relire les mentions légales', 'todo', 'basse',
              timestamptz '2026-02-03 08:00+00', 'user', $4`,
      [organization.id, spaceId, listId, camille.userId],
    );
    const owners = organization.volumeAccounts;
    await asSystem(
      `insert into task_assignees (organization_id, task_id, user_id, position)
       select t.organization_id, t.id, ($2::uuid[])[(t.key_number + p) % array_length($2::uuid[], 1) + 1], p
         from tasks as t cross join generate_series(0, 1) as p
        where t.organization_id = $1 and t.key_prefix in ('BIG', 'ONE')`,
      [organization.id, owners],
    );
    await asSystem(
      `insert into task_labels (organization_id, task_id, label_key, name, position)
       select t.organization_id, t.id, (array['auth', 'back'])[p + 1], (array['Auth', 'Back'])[p + 1], p
         from tasks as t cross join generate_series(0, 1) as p
        where t.organization_id = $1 and t.key_prefix in ('BIG', 'ONE')`,
      [organization.id],
    );
    await asSystem(
      `insert into checklist_items (organization_id, task_id, text, done, position)
       select t.organization_id, t.id, 'Étape ' || p, p = 0, p
         from tasks as t cross join generate_series(0, 2) as p
        where t.organization_id = $1 and t.key_prefix in ('BIG', 'ONE')`,
      [organization.id],
    );
    await asSystem(
      `insert into activity_entries (organization_id, task_id, list_id, kind, actor_type, actor_id, occurred_at,
                                     priority_from, priority_to)
       select t.organization_id, t.id, t.list_id, (array['create', 'priority', 'priority'])[p + 1], 'user',
              t.created_by_id, t.created_at + make_interval(mins => p),
              (array[null, 'basse', 'haute'])[p + 1], (array[null, 'haute', 'urgente'])[p + 1]
         from tasks as t cross join generate_series(0, 2) as p
        where t.organization_id = $1 and t.key_prefix in ('BIG', 'ONE')`,
      [organization.id],
    );
    await trashTrees(
      organization.id,
      `select t.id, t.list_id, t.created_by_id, 'BIG-2' as parent_key from tasks as t
        where t.organization_id = $1 and t.key_prefix = 'BIG' and t.key_number between 701 and 704`,
      [],
      `now() - interval '2 hours'`,
    );
    await trashTrees(
      organization.id,
      `select t.id, t.list_id, t.created_by_id, null::text as parent_key from tasks as t
        where t.organization_id = $1 and t.key_prefix = 'ONE'`,
      [],
      `now() - interval '90 minutes'`,
    );
    await trashTrees(
      organization.id,
      `select t.id, t.list_id, t.created_by_id, null::text as parent_key from tasks as t
        where t.organization_id = $1 and t.key_prefix = 'BIG' and t.key_number = 1`,
      [],
      trashedAt,
    );
    const entries = await asSystem<{ readonly id: string; readonly key_prefix: string }>(
      `select e.id::text as id, t.key_prefix from trash_entries as e
         join tasks as t on t.organization_id = e.organization_id and t.id = e.root_task_id
        where e.organization_id = $1 and t.key_prefix in ('BIG', 'ONE') and t.key_number = 1`,
      [organization.id],
    );
    const ids = await asSystem<{ readonly id: string }>(
      `select id::text as id from tasks where organization_id = $1 and key_prefix = 'BIG' and key_number <= 651
        order by key_number`,
      [organization.id],
    );
    return {
      big: entries.find((row) => row.key_prefix === 'BIG')?.id ?? '',
      one: entries.find((row) => row.key_prefix === 'ONE')?.id ?? '',
      tasks: ids.map((row) => row.id),
    };
  }

  /**
   * Seeds the large list: 16,000 top-level tasks and a subtask under one in four, one top-level task
   * in ten archived with its subtree, the list itself deleted, and the oldest 12,000 trees in the
   * trash (15,000 tasks, 1,200 of the entries rooted at an archived task).
   */
  async function seedLargeList(): Promise<void> {
    const statuses = `(array['triage', 'backlog', 'todo', 'progress', 'review', 'testing', 'waiting', 'blocked', 'done', 'cancelled'])`;
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status,
                          priority, due_date, completed_at, cancel_reason, created_at, created_by_type,
                          created_by_id)
       select $1, $2, $3, 'BLK', n, 'Tâche ' || md5(n::text) || ' n°' || n,
              st.status, (array['urgente', 'haute', 'moyenne', 'basse'])[1 + n % 4],
              case when n % 3 = 0 then null else date '2026-10-01' + (n % 90) end,
              case when st.status = 'done' then timestamptz '2026-10-01 08:00+00' + n * interval '1 second' end,
              case when st.status = 'cancelled' then 'duplicate' end,
              timestamptz '2026-03-02 08:00+00' + n * interval '37 seconds', 'user', $4
         from generate_series(1, $5::int) as n
        cross join lateral (select ${statuses}[1 + (n / 5) % 10] as status) as st`,
      [atelierNordId, largeSpaceId, largeListId, camille.userId, LARGE_LIST.tops],
    );
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, parent_id, key_prefix, key_number, name,
                          status, priority, due_date, completed_at, cancel_reason, created_at,
                          created_by_type, created_by_id)
       select p.organization_id, p.space_id, p.list_id, p.id, 'BLK', p.key_number + $3::int,
              'Sous-tâche de ' || p.name, st.status, 'moyenne',
              case when p.key_number % 8 = 0 then null else date '2026-10-15' + (p.key_number % 60) end,
              case when st.status = 'done' then timestamptz '2026-10-02 08:00+00' end,
              case when st.status = 'cancelled' then 'obsolete' end,
              p.created_at + interval '1 second', 'user', p.created_by_id
         from tasks as p
        cross join lateral (select ${statuses}[1 + (p.key_number * 3) % 10] as status) as st
        where p.organization_id = $1 and p.list_id = $2 and p.parent_id is null and p.key_number % 4 = 0`,
      [atelierNordId, largeListId, LARGE_LIST.tops],
    );
    await archiveSubtrees(
      atelierNordId,
      `select t.id, timestamptz '2026-10-01 08:00+00' + make_interval(secs => t.key_number * 30) as archived_at
         from tasks as t
        where t.organization_id = $1 and t.list_id = $2 and t.parent_id is null and t.key_number % 10 = 3`,
      [largeListId],
    );
    await trashTrees(
      atelierNordId,
      `select t.id, t.list_id, t.created_by_id, null::text as parent_key from tasks as t
        where t.organization_id = $1 and t.list_id = $2 and t.parent_id is null and t.key_number <= $3`,
      [largeListId, LARGE_LIST.trashedTops],
      `now() - interval '10 minutes' - make_interval(secs => r.rn::int / 4)`,
    );
    await asSystem(
      `update lists set deleted_at = now() - interval '1 day', deleted_by_type = 'user', deleted_by_id = $3
        where organization_id = $1 and id = $2`,
      [atelierNordId, largeListId, camille.userId],
    );
  }

  /**
   * Seeds the deleted list the deletion job has not moved yet: 600 trees of 11 tasks (a task, five
   * subtasks, five subtasks of the first one), one tree in ten archived.
   */
  async function seedDeletedList(): Promise<void> {
    const insertTasks = `insert into tasks (organization_id, space_id, list_id, parent_id, key_prefix, key_number, name,
                                            status, priority, created_at, created_by_type, created_by_id)`;
    await asSystem(
      `${insertTasks}
       select $1, $2, $3, null, 'DEL', (n - 1) * 11 + 1, 'Chantier ' || n, 'todo', 'moyenne',
              timestamptz '2026-04-01 08:00+00' + make_interval(secs => n * 7), 'user', $4
         from generate_series(1, $5::int) as n`,
      [atelierNordId, produitId, deletedListId, camille.userId, DELETED_LIST_TREES],
    );
    await asSystem(
      `${insertTasks}
       select $1, $2, $3, p.id, 'DEL', p.key_number + j, 'Étape ' || j || ' de ' || p.name, 'todo', 'moyenne',
              p.created_at + make_interval(secs => j), 'user', $4
         from tasks as p cross join generate_series(1, 5) as j
        where p.organization_id = $1 and p.key_prefix = 'DEL' and p.parent_id is null`,
      [atelierNordId, produitId, deletedListId, camille.userId],
    );
    await asSystem(
      `${insertTasks}
       select $1, $2, $3, p.id, 'DEL', p.key_number + 4 + j, 'Détail ' || j || ' de ' || p.name, 'todo', 'basse',
              p.created_at + make_interval(secs => j), 'user', $4
         from tasks as p cross join generate_series(1, 5) as j
        where p.organization_id = $1 and p.key_prefix = 'DEL' and p.key_number % 11 = 2`,
      [atelierNordId, produitId, deletedListId, camille.userId],
    );
    await archiveSubtrees(
      atelierNordId,
      `select t.id, timestamptz '2026-05-01 08:00+00' + make_interval(mins => t.key_number) as archived_at
         from tasks as t
        where t.organization_id = $1 and t.key_prefix = 'DEL' and t.parent_id is null
          and ((t.key_number - 1) / 11) % 10 = 3`,
    );
  }

  /**
   * Seeds the pending and answered access requests of Atelier Nord: from the 300 first accounts,
   * on tasks of the volume and of the big entry, lists of the volume and of the space of 1,000 lists,
   * and the spaces of the volume.
   */
  async function seedAccessRequests(): Promise<void> {
    const columns = `organization_id, target, target_id, space_id, list_id, task_id, task_key, requester_user_id, state, role, created_at, decided_at, decided_by_type, decided_by_id`;
    const people = `(select a.user_id::uuid as user_id, a.n from unnest($2::text[]) with ordinality as a (user_id, n))`;
    await asSystem(
      `insert into access_requests (${columns})
       select t.organization_id, 'task', t.id, t.space_id, t.list_id, t.id, t.key_prefix || '-' || t.key_number,
              p.user_id, 'pending', null, now() - make_interval(secs => p.n::int * 3 + j), null, null, null
         from ${people} as p cross join generate_series(0, 9) as j
         join tasks as t on t.organization_id = $1 and t.key_prefix = 'VOL'
          and t.key_number = 1 + ((p.n * 7919 + j * 104729) % 63000)
        where p.n <= 300
       on conflict do nothing`,
      [atelierNordId, accounts],
    );
    await asSystem(
      `insert into access_requests (${columns})
       select t.organization_id, 'task', t.id, t.space_id, t.list_id, t.id, t.key_prefix || '-' || t.key_number,
              p.user_id, 'pending', null, now() - make_interval(secs => p.n::int), null, null, null
         from ${people} as p cross join generate_series(0, 1) as j
         join tasks as t on t.organization_id = $1 and t.key_prefix = 'BIG' and t.key_number = p.n + j * 300
        where p.n <= 300
       on conflict do nothing`,
      [atelierNordId, accounts],
    );
    await asSystem(
      `insert into access_requests (${columns})
       select l.organization_id, 'list', l.id, l.space_id, l.id, null, null,
              p.user_id, 'pending', null, now() - make_interval(secs => p.n::int * 2 + j), null, null, null
         from ${people} as p cross join generate_series(0, 2) as j
         join ${seededLists} as l on l.rank = (p.n * 13 + j * 1009) % 3000
        where p.n <= 300
       on conflict do nothing`,
      [atelierNordId, accounts],
    );
    await asSystem(
      `insert into access_requests (${columns})
       select l.organization_id, 'list', l.id, l.space_id, l.id, null, null,
              p.user_id, 'pending', null, now() - make_interval(secs => p.n::int * 5), null, null, null
         from ${people} as p
         join ${seededLists} as l on l.rank = 1
        where p.n <= 30
       on conflict do nothing`,
      [atelierNordId, accounts],
    );
    await asSystem(
      `insert into access_requests (${columns})
       select s.organization_id, 'space', s.id, s.id, null, null, null,
              p.user_id, 'pending', null, now() - make_interval(secs => p.n::int * 7), null, null, null
         from ${people} as p
         join (select organization_id, id, row_number() over (order by created_at, id) as n
                 from spaces where organization_id = $1 and name like 'Volume %') as s on s.n = p.n
        where p.n <= 300
       on conflict do nothing`,
      [atelierNordId, accounts],
    );
    await asSystem(
      `insert into access_requests (${columns})
       select l.organization_id, 'list', l.id, l.space_id, l.id, null, null,
              p.user_id, 'pending', null, now() - make_interval(secs => p.n::int * 9 + j), null, null, null
         from ${people} as p cross join generate_series(0, 1) as j
         join (select organization_id, id, space_id, row_number() over (order by created_at, id) as n
                 from lists where organization_id = $1 and space_id = $3::uuid) as l on l.n = p.n + j * 400
        where p.n <= 300
       on conflict do nothing`,
      [atelierNordId, accounts, milleSpaceId],
    );
    await asSystem(
      `insert into access_requests (${columns})
       select s.organization_id, 'space', s.id, s.id, null, null, null,
              p.user_id, 'pending', null, now() - make_interval(secs => p.n::int * 11), null, null, null
         from ${people} as p
         join spaces as s on s.organization_id = $1 and s.id = $3::uuid
        where p.n <= 20
       on conflict do nothing`,
      [atelierNordId, accounts, milleSpaceId],
    );
    await asSystem(
      `insert into access_requests (${columns})
       select t.organization_id, 'task', t.id, t.space_id, t.list_id, t.id, t.key_prefix || '-' || t.key_number,
              p.user_id, 'approved', 'view', now() - interval '20 days', now() - interval '19 days', 'user', $3
         from ${people} as p cross join generate_series(0, 4) as j
         join tasks as t on t.organization_id = $1 and t.key_prefix = 'VOL'
          and t.key_number = 1 + ((p.n * 4999 + j * 77773) % 63000)
        where p.n <= 300
       on conflict do nothing`,
      [atelierNordId, accounts, camille.userId],
    );
  }

  /**
   * Seeds the third organization: 100,000 tasks of 100 lists, each its own entry, 5,000 entries
   * handed over and 5,000 31 days old.
   */
  async function seedCorbeille(): Promise<void> {
    const seeded = await seedSpace(
      corbeilleId,
      'Corbeille',
      'CRB',
      solene.userId,
      Array.from({ length: CORBEILLE.lists }, (_unused, index) => `Liste ${String(index)}`),
    );
    corbeilleLists = Object.values(seeded.listIds);
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status, priority,
                          created_at, created_by_type, created_by_id)
       select $1, l.space_id, l.id, 'CRB', n, 'Tâche supprimée ' || n, 'todo', 'moyenne',
              timestamptz '2026-05-01 08:00+00' + make_interval(secs => n * 11), 'user', $2
         from generate_series(1, $3::int) as n
         join (select id, space_id, row_number() over (order by id) - 1 as rank
                 from lists where organization_id = $1) as l on l.rank = n % $4::int`,
      [corbeilleId, solene.userId, CORBEILLE.entries, CORBEILLE.lists],
    );
    // Every task is its own entry: the entries get their ids first. One statement per list: the
    // planner has no statistics of the rows just inserted, and a join of the whole organization
    // would loop over the common table expression once per task.
    for (const listId of corbeilleLists) {
      await asSystem(
        `with ids as (
           select t.id as task_id, t.list_id, t.created_by_id, uuidv7() as entry_id,
                  (t.key_number - 1) as rn
             from tasks as t where t.organization_id = $1 and t.list_id = $2
         ),
         created as (
           insert into trash_entries (organization_id, id, root_task_id, list_id, parent_key, task_count,
                                      trashed_at, trashed_by_type, trashed_by_id)
           select $1::uuid, i.entry_id, i.task_id, i.list_id, null, 1,
                  now() - interval '5 minutes' - make_interval(secs => i.rn::int / 2), 'user', i.created_by_id
             from ids as i
           returning id
         )
         update tasks as t set trash_entry_id = i.entry_id
           from ids as i where t.organization_id = $1 and t.id = i.task_id`,
        [corbeilleId, listId],
      );
    }
    await ageEntries(corbeilleId, 20, true, randomUUID());
  }

  /**
   * Gives every task of a range of a list an entry of its own, one statement for the range (a few
   * thousand rows: the planner has no statistics of the rows just inserted).
   *
   * @param organizationId - The organization.
   * @param listId - The list.
   * @param from - The first key number.
   * @param to - The last key number.
   */
  async function trashEachTask(
    organizationId: string,
    listId: string,
    from: number,
    to: number,
  ): Promise<void> {
    await asSystem(
      `with ids as (
         select t.id as task_id, t.list_id, t.created_by_id, uuidv7() as entry_id, t.key_number as rn
           from tasks as t
          where t.organization_id = $1 and t.list_id = $2 and t.key_number between $3 and $4
       ),
       created as (
         insert into trash_entries (organization_id, id, root_task_id, list_id, parent_key, task_count,
                                    trashed_at, trashed_by_type, trashed_by_id)
         select $1::uuid, i.entry_id, i.task_id, i.list_id, null, 1,
                now() - interval '2 minutes' - make_interval(secs => i.rn::int / 100), 'user', i.created_by_id
           from ids as i
         returning id
       )
       update tasks as t set trash_entry_id = i.entry_id
         from ids as i where t.organization_id = $1 and t.id = i.task_id`,
      [organizationId, listId, from, to],
    );
  }

  /**
   * Seeds 500 organizations that only hold entries (their tasks are of no interest to the scan):
   * 40 entries each, five of them with an entry 31 days old and three with entries handed over.
   */
  async function seedEntryOrganizations(): Promise<void> {
    await asSystem(
      `insert into trash_entries (organization_id, root_task_id, list_id, parent_key, task_count, trashed_at,
                                 trashed_by_type, trashed_by_id, purge_requested_at, purge_requested_by_type,
                                 purge_requested_by_id)
       select md5('organisation ' || o)::uuid, gen_random_uuid(), gen_random_uuid(), null, 1 + e % 3,
              case when o in (7, 77, 177, 277, 377) and e = 0 then now() - interval '31 days'
                   else now() - make_interval(mins => 5 + e) end,
              'user', 'user-' || o,
              case when o in (11, 111, 411) and e < 2 then now() - interval '10 minutes' end,
              case when o in (11, 111, 411) and e < 2 then 'user' end,
              case when o in (11, 111, 411) and e < 2 then 'user-' || o end
         from generate_series(1, $1::int) as o cross join generate_series(0, 39) as e`,
      [ENTRY_ORGANIZATIONS],
    );
  }

  beforeAll(async () => {
    const seedStarted = performance.now();
    const phase = (name: string): void => {
      console.info(
        `trash plans seed | ${name} | ${String(Math.round((performance.now() - seedStarted) / 1000))} s`,
      );
    };
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
      max: 3,
    });

    // PR 3 first kept a task out of its archive in the trash (the check below); an entry now holds
    // the archived tasks of its tree with their archive. A regenerated migration has no such
    // check: the drop is then a no-op, the seed the same.
    const check = await migrator.query<{ readonly count: number }>(
      `select count(*)::int as count from pg_constraint where conname = 'tasks_trashed_not_archived_check'`,
    );
    if ((check.rows[0]?.count ?? 0) > 0) {
      console.info(
        'trash plans: migration 0007 still carries tasks_trashed_not_archived_check, dropped before the seed (entries hold archived tasks)',
      );
      await migrator.query(`alter table tasks drop constraint tasks_trashed_not_archived_check`);
    }

    // Spaces and lists.
    const produit = await seedSpace(atelierNordId, 'Produit', 'CAD', camille.userId, [
      'Corbeille volumineuse',
      'Liste supprimée du lot',
    ]);
    produitId = produit.spaceId;
    bigListId = produit.listIds['Corbeille volumineuse'] ?? '';
    deletedListId = produit.listIds['Liste supprimée du lot'] ?? '';
    const large = await seedSpace(atelierNordId, 'Import massif', 'BLK', camille.userId, [
      'Import de l’an dernier',
    ]);
    largeSpaceId = large.spaceId;
    largeListId = large.listIds['Import de l’an dernier'] ?? '';
    const mille = await seedSpace(
      atelierNordId,
      'Mille listes',
      'MIL',
      camille.userId,
      Array.from({ length: 1_000 }, (_unused, index) => `Liste ${String(index)}`),
    );
    milleSpaceId = mille.spaceId;
    await asSystem(
      `update lists set deleted_at = now() - interval '1 day', deleted_by_type = 'user', deleted_by_id = $3
        where organization_id = $1 and id = $2`,
      [atelierNordId, deletedListId, camille.userId],
    );
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
    // Three deleted spaces with their ten deleted lists, their grants and the grants of the guest.
    const oldSpaces: string[] = [];
    const oldLists: string[] = [];
    for (const index of [1, 2, 3]) {
      const old = await seedSpace(
        atelierNordId,
        `Ancien projet ${String(index)}`,
        `OL${String.fromCharCode(64 + index)}`,
        camille.userId,
        Array.from({ length: 10 }, (_unused, k) => `Liste ${String(k)}`),
      );
      oldSpaces.push(old.spaceId);
      oldLists.push(...Object.values(old.listIds));
    }
    oldSpaceIds = oldSpaces;
    oldListIds = oldLists;
    await asSystem(
      `update spaces set deleted_at = now() - interval '2 days', deleted_by_type = 'user', deleted_by_id = $2
        where organization_id = $1 and id = any($3::uuid[])`,
      [atelierNordId, camille.userId, oldSpaces],
    );
    await asSystem(
      `update lists set deleted_at = now() - interval '2 days', deleted_by_type = 'user', deleted_by_id = $2
        where organization_id = $1 and space_id = any($3::uuid[])`,
      [atelierNordId, camille.userId, oldSpaces],
    );
    await asSystem(
      `insert into space_grants
         (organization_id, space_id, user_id, role, granted_by_type, granted_by_id, created_at, granted_at)
       select $1, s, ($3::uuid[])[440 + k], (array['edit', 'comment', 'view'])[k % 3 + 1], 'user', $2, now(), now()
         from unnest($4::uuid[]) as s cross join generate_series(0, 19) as k`,
      [atelierNordId, camille.userId, accounts, oldSpaces],
    );
    await asSystem(
      `insert into list_grants
         (organization_id, list_id, space_id, user_id, role, granted_by_type, granted_by_id, created_at, granted_at)
       select $1, li.id, li.space_id, ($3::uuid[])[441 + k], (array['edit', 'comment', 'view'])[k % 3 + 1],
              'user', $2, now(), now()
         from lists as li cross join generate_series(0, 9) as k
        where li.organization_id = $1 and li.space_id = any($4::uuid[])
       union all
       select $1, li.id, li.space_id, $5::uuid, 'view', 'user', $2, now(), now()
         from lists as li where li.organization_id = $1 and li.space_id = any($4::uuid[])`,
      [atelierNordId, camille.userId, accounts, oldSpaces, guestId],
    );

    // Tasks.
    phase('spaces and grants');
    await seedVolumeTasks(
      atelierNordId,
      accounts.filter((account) => account !== memberId),
    );
    await seedVolumeTasks(atelierDeltaId, noise);
    phase('volume tasks');
    await seedVolumeCollections(atelierNordId);
    await archiveVolume(atelierNordId);
    await archiveVolume(atelierDeltaId);
    phase('volume collections and archives');
    await seedLargeList();
    phase('large list');
    await seedDeletedList();

    phase('deleted list');
    // The entries of the volume (the first three top-level tasks of every list), then the big ones.
    for (const organizationId of [atelierNordId, atelierDeltaId]) {
      await trashTrees(
        organizationId,
        `select t.id, t.list_id, t.created_by_id, null::text as parent_key from tasks as t
          where t.organization_id = $1 and t.key_prefix = 'VOL' and t.parent_id is null
            and (t.key_number - 1) % ${String(TASKS_PER_LIST)} in (0, 1, 2)`,
        [],
        `now() - interval '1 hour' - make_interval(secs => r.rn::int / 3)`,
      );
    }
    phase('volume entries');
    const big = await seedBigEntry(
      { id: atelierNordId, volumeAccounts: accounts.slice(0, 50) },
      produitId,
      bigListId,
      `now() - interval '1 hour'`,
    );
    bigEntryId = big.big;
    oneEntryId = big.one;
    bigTaskIds = big.tasks;
    // The entry of 651 tasks of the second organization is the oldest due: its first purge batch.
    const delta = await seedSpace(atelierDeltaId, 'Chantier', 'CHA', solene.userId, [
      'Grande liste',
    ]);
    await seedBigEntry(
      { id: atelierDeltaId, volumeAccounts: noise.slice(0, 50) },
      delta.spaceId,
      delta.listIds['Grande liste'] ?? '',
      `now() - interval '40 days'`,
    );
    phase('big entries');
    await ageEntries(atelierNordId, 20, true, bigListId);
    await ageEntries(atelierDeltaId, 8, false, delta.listIds['Grande liste'] ?? '');
    phase('aged entries');
    // A deleted list of 20,000 tasks, every one of them in the trash (one entry each).
    const [fullList] = await asSystem<{ readonly id: string }>(
      `insert into lists (organization_id, space_id, name, color, deleted_at, deleted_by_type, deleted_by_id)
       values ($1, $2, 'Liste entièrement dans la corbeille', 'gris', now() - interval '1 hour', 'user', $3)
       returning id::text as id`,
      [atelierDeltaId, delta.spaceId, solene.userId],
    );
    fullTrashListId = fullList?.id ?? '';
    await asSystem(
      `insert into tasks (organization_id, space_id, list_id, key_prefix, key_number, name, status, priority,
                          created_at, created_by_type, created_by_id)
       select $1, $2, $3, 'FUL', n, 'Tâche de la corbeille ' || n, 'todo', 'moyenne',
              timestamptz '2026-06-01 08:00+00' + make_interval(secs => n * 13), 'user', $4
         from generate_series(1, 20000) as n`,
      [atelierDeltaId, delta.spaceId, fullTrashListId, solene.userId],
    );
    for (let from = 1; from <= 20_000; from += 1_000) {
      await trashEachTask(atelierDeltaId, fullTrashListId, from, from + 999);
    }
    phase('list of 20,000 tasks in the trash');
    await seedAccessRequests();
    phase('access requests');
    await seedCorbeille();
    phase('third organization');
    await seedEntryOrganizations();

    phase('500 organizations');
    // The guest keeps a role on lists through list grants, tombstones included; the viewers' lists.
    // The statistics and the visibility map an autovacuum would have produced after such an import.
    await migrator.query(
      `vacuum (analyze) spaces, lists, space_grants, list_grants, tasks, task_assignees, task_labels,
                        activity_entries, checklist_items, trash_entries, access_requests`,
    );
    ownerLists = await editableLists(asOwner, atelierNordId);
    adminLists = await editableLists(asAdmin, atelierNordId);
    memberLists = await editableLists(asMember, atelierNordId);
    guestLists = await editableLists(asGuest, atelierNordId);
    allLists = (
      await asSystem<{ readonly id: string }>(
        `select id::text as id from lists where organization_id = $1`,
        [atelierNordId],
      )
    ).map((row) => row.id);
    twoLists = (
      await asSystem<{ readonly list_id: string }>(
        `select list_id::text as list_id from trash_entries
          where organization_id = $1 and purge_requested_at is null
          group by list_id having count(*) = 3 order by list_id limit 2`,
        [atelierNordId],
      )
    ).map((row) => row.list_id);
    const [size] = await asSystem<{ readonly tasks: number }>(
      `select (pg_relation_size('tasks') / 8192)::int as tasks`,
    );
    tasksBlocks = size?.tasks ?? 0;
  }, 1_800_000);

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
         (select count(*)::int from tasks where organization_id = $1 and trash_entry_id is not null) as "trashedTasks",
         (select count(*)::int from tasks where organization_id = $1 and trash_entry_id is not null and archived_at is not null) as "trashedArchived",
         (select count(*)::int from tasks where organization_id = $1 and list_id = $3) as "largeList",
         (select count(*)::int from tasks where organization_id = $1 and list_id = $3 and trash_entry_id is not null) as "largeListTrashed",
         (select count(*)::int from trash_entries where organization_id = $1) as entries,
         (select count(*)::int from trash_entries where organization_id = $1 and purge_requested_at is null) as "inTrash",
         (select count(*)::int from trash_entries where organization_id = $1 and purge_requested_at is not null) as "handedOver",
         (select count(*)::int from trash_entries where organization_id = $1 and purge_requested_at is null
             and trashed_at <= now() - interval '30 days') as due,
         (select max(task_count)::int from trash_entries where organization_id = $1) as "largestEntry",
         (select count(*)::int from lists where organization_id = $1) as lists,
         (select count(*)::int from lists where organization_id = $1 and deleted_at is not null) as "deletedLists",
         (select count(*)::int from spaces where organization_id = $1) as spaces,
         (select count(*)::int from spaces where organization_id = $1 and deleted_at is not null) as "deletedSpaces",
         (select count(*)::int from list_grants where organization_id = $1) as "listGrants",
         (select count(*)::int from space_grants where organization_id = $1) as "spaceGrants",
         (select count(*)::int from access_requests where organization_id = $1 and state = 'pending') as "pendingRequests",
         (select count(distinct requester_user_id)::int from access_requests where organization_id = $1 and state = 'pending') as requesters,
         (select count(*)::int from activity_entries where organization_id = $1) as activity,
         (select count(*)::int from checklist_items where organization_id = $1) as checklist,
         (select count(*)::int from tasks where organization_id = $2) as "deltaTasks",
         (select count(*)::int from trash_entries where organization_id = $2) as "deltaEntries",
         (select count(*)::int from tasks where organization_id = $4) as "corbeilleTasks",
         (select count(*)::int from trash_entries where organization_id = $4) as "corbeilleEntries",
         (select count(distinct organization_id)::int from trash_entries) as "organizationsWithEntries",
         (select count(*)::int from tasks) as "tableTasks",
         (select count(*)::int from trash_entries) as "tableEntries"`,
      [atelierNordId, atelierDeltaId, largeListId, corbeilleId],
    );
    console.info(
      `trash plans volume: ${JSON.stringify({ ...volume, tasksBlocks, ownerLists: ownerLists.length, adminLists: adminLists.length, memberLists: memberLists.length, guestLists: guestLists.length })}`,
    );
    // The extended statistics of migration 0007 on (organization_id, list_id), which the trash page is
    // planned from: they exist (the three kinds) and the vacuum (analyze) of the seed builds them.
    const [statistics] = await asSystem<{ readonly kinds: string }>(
      `select array_to_string(stxkind, ',') as kinds from pg_statistic_ext
        where stxname = 'trash_entries_list_statistics'`,
    );
    expect(statistics?.kinds.split(',').sort()).toEqual(['d', 'f', 'm']);
    expect(volume?.tasks).toBeGreaterThanOrEqual(75_000);
    expect(volume?.entries).toBeGreaterThanOrEqual(20_000);
    expect(volume?.inTrash).toBeGreaterThanOrEqual(19_000);
    expect(volume?.handedOver).toBeGreaterThan(900);
    expect(volume?.due).toBeGreaterThan(900);
    expect(volume?.largestEntry).toBe(651);
    expect(volume?.largeList).toBe(LARGE_LIST.tops + LARGE_LIST.subtasks);
    expect(volume?.largeListTrashed).toBe(15_000);
    expect(volume?.trashedArchived).toBeGreaterThan(1_000);
    expect(volume?.lists).toBeGreaterThan(4_000);
    expect(volume?.deletedLists).toBeGreaterThan(90);
    expect(volume?.deletedSpaces).toBe(3);
    expect(volume?.pendingRequests).toBeGreaterThanOrEqual(5_000);
    expect(volume?.requesters).toBe(300);
    expect(volume?.deltaEntries).toBeGreaterThan(3_000);
    expect(volume?.corbeilleEntries).toBe(CORBEILLE.entries);
    expect(volume?.organizationsWithEntries).toBeGreaterThan(500);
    expect(volume?.tableTasks).toBeGreaterThan(200_000);
    expect(adminLists.length).toBeGreaterThan(1_400);
    expect(ownerLists.length).toBeGreaterThan(2_000);
    expect(allLists.length).toBeGreaterThan(4_000);
    expect(memberLists.length).toBeGreaterThan(0);
    expect(corbeilleLists).toHaveLength(CORBEILLE.lists);
  });

  it('(1) serves the first page and a keyset page of the trash in the order of trash_entries_trashed_index and the roots by primary key, for a caller with edit on two lists, on the lists of a member and on all of an admin', async () => {
    const callers: readonly (readonly [string, string, readonly string[]])[] = [
      ['two lists', atelierNordId, twoLists],
      ['member', atelierNordId, memberLists],
      ['admin', atelierNordId, adminLists],
      ['every list', atelierNordId, allLists],
      ['two lists, 100,000 entries', corbeilleId, corbeilleLists.slice(0, 2)],
      ['every list, 100,000 entries', corbeilleId, corbeilleLists],
    ];
    const candidate =
      'create index trash_entries_trashed_list_candidate on trash_entries (organization_id, trashed_at, id) include (list_id) where purge_requested_at is null';
    const plans: PlanLine[] = [];
    const walks: PlanLine[] = [];
    const withCandidate: PlanLine[] = [];
    for (const [caller, organizationId, listIds] of callers) {
      const first = await rowsOf<{ readonly id: string; readonly trashedAt: string }>(
        trashPageStatement(organizationId, listIds, null, 51),
        organizationId,
      );
      const last = first.at(-1);
      const pages: (readonly [string, TrashPosition | null])[] = [['page 1', null]];
      if (last !== undefined && first.length === 51) {
        pages.push(['page 2', { trashedAt: new Date(last.trashedAt), id: last.id }]);
      }
      for (const [page, after] of pages) {
        const statement = trashPageStatement(organizationId, listIds, after, 51);
        const label = `trash ${page} | ${caller} (${String(listIds.length)} lists)`;
        plans.push(await planOf(label, statement, { organizationId }));
        // The walk of the partial index in its order, which a bitmap scan of the primary key and
        // a sort replace when the planner prefers them, and the same with a candidate index that
        // holds the list, in a transaction that is rolled back.
        walks.push(
          await planOf(`${label} | serial (parallel workers off)`, statement, {
            organizationId,
            settings: ['max_parallel_workers_per_gather = 0'],
          }),
        );
        walks.push(
          await planOf(
            `${label} | walk (bitmap scans, sequential scans and sorts off)`,
            statement,
            {
              organizationId,
              settings: ['enable_bitmapscan = off', 'enable_seqscan = off', 'enable_sort = off'],
            },
          ),
        );
        withCandidate.push(
          await planOf(
            `${label} | candidate (organization_id, trashed_at, id) include (list_id)`,
            statement,
            {
              organizationId,
              migrator: true,
              prepare: async (client) => {
                await client.query(candidate);
              },
            },
          ),
        );
      }
    }
    const [leftover] = (
      await migrator.query<{ readonly count: number }>(
        `select (select count(*)::int from pg_indexes where indexname like 'trash_entries%candidate') + (select count(*)::int from pg_statistic_ext where stxname like 'trash_entries%candidate') as count`,
      )
    ).rows;
    for (const plan of [...plans, ...walks, ...withCandidate]) {
      console.info(lineOf(plan));
    }
    expect(leftover?.count).toBe(0);
    expect(seqScansOf([...plans, ...walks, ...withCandidate], ['tasks'])).toEqual([]);
    for (const plan of plans) {
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    // A page of a caller with many lists stops after its 51 rows: it walks the partial index in
    // its order from the keyset. The planner underestimates `list_id = any(...)` (286 rows for
    // 7,418) and prices a bitmap scan of the whole organization and a sort below the walk: each
    // page then costs O(entries of the organization).
    for (const plan of plans.filter(
      (entry) => !entry.label.includes('two lists') && entry.rows >= 51,
    )) {
      expect
        .soft(plan.indexes, `${plan.label}: ${plan.nodes.join(' > ')}`)
        .toContain('trash_entries_trashed_index');
      // Neither a sort nor a bitmap scan of the organization's entries ...
      expect
        .soft(plan.nodes.join(' > '), plan.label)
        .not.toMatch(/Sort|Bitmap Heap Scan trash_entries/u);
      // ... and a bounded read: 259 buffers serially, three times as many when the planner walks with
      // two workers and the leader (each reads its 51 rows), never O(entries).
      expect
        .soft(plan.blocks, `${plan.label} reads ${String(plan.blocks)} buffers`)
        .toBeLessThan(1_000);
    }
  }, 300_000);

  it('(2, 3) counts the entries in trash and hands them over to the purge in one statement, at 20,000 and 100,000 entries, well under the 10 s statement timeout of task_app', async () => {
    const totals: PlanLine[] = [
      await planOf(
        'trash total | admin, Atelier Nord',
        trashTotalStatement(atelierNordId, adminLists),
      ),
      await planOf(
        'trash total | every list, Atelier Nord (20,000 entries)',
        trashTotalStatement(atelierNordId, allLists),
      ),
      await planOf(
        'trash total | two lists, Atelier Nord',
        trashTotalStatement(atelierNordId, twoLists),
      ),
      await planOf(
        'trash total | every list, 100,000 entries',
        trashTotalStatement(corbeilleId, corbeilleLists),
        { organizationId: corbeilleId },
      ),
      await planOf(
        'trash total | two lists, 100,000 entries',
        trashTotalStatement(corbeilleId, corbeilleLists.slice(0, 2)),
        { organizationId: corbeilleId },
      ),
    ];
    const [{ total: nordTotal } = { total: 0 }] = await rowsOf<{ readonly total: number }>(
      trashTotalStatement(atelierNordId, allLists),
    );
    const [{ total: corbeilleTotal } = { total: 0 }] = await rowsOf<{ readonly total: number }>(
      trashTotalStatement(corbeilleId, corbeilleLists),
      corbeilleId,
    );
    const at = new Date();
    const purges: PlanLine[] = [
      await planOf(
        'request purge | every list, Atelier Nord (20,000 entries)',
        requestPurgeStatement(atelierNordId, allLists, at, { type: 'user', id: camille.userId }),
        { write: true },
      ),
      await planOf(
        'request purge | every list, 100,000 entries',
        requestPurgeStatement(corbeilleId, corbeilleLists, at, { type: 'user', id: solene.userId }),
        { write: true, organizationId: corbeilleId },
      ),
    ];
    for (const plan of [...totals, ...purges]) {
      console.info(lineOf(plan));
    }
    console.info(
      `trash plans: the totals count ${String(nordTotal)} entries of Atelier Nord and ${String(corbeilleTotal)} of the third organization`,
    );
    expect(nordTotal).toBeGreaterThan(19_000);
    expect(corbeilleTotal).toBeGreaterThan(90_000);
    expect(seqScansOf([...totals, ...purges], ['tasks'])).toEqual([]);
    for (const plan of totals) {
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    // The statement timeout of the application role is 10 s: the UPDATE of every entry of an
    // organization of 100,000 stays far under it.
    for (const plan of purges) {
      expect(plan.milliseconds, plan.label).toBeLessThan(5_000);
    }
  }, 300_000);

  it('(4) walks the partial indexes in order for the entries due and handed over, and skips what another transaction locked', async () => {
    const dueBefore = new Date(Date.now() - 30 * 24 * 3_600_000);
    const [{ handed, due } = { handed: 0, due: 0 }] = await asSystem<{
      readonly handed: number;
      readonly due: number;
    }>(
      `select count(*) filter (where purge_requested_at is not null)::int as handed,
              count(*) filter (where purge_requested_at is null and trashed_at <= $2)::int as due
         from trash_entries where organization_id = $1`,
      [atelierNordId, dueBefore],
    );
    const plans: PlanLine[] = [
      await planOf(
        'handed over | 20 entries, Atelier Nord',
        handedOverEntriesStatement(atelierNordId, 20),
        { write: true },
      ),
      await planOf(
        'due | 20 entries, Atelier Nord',
        dueEntriesStatement(atelierNordId, dueBefore, 20),
        { write: true },
      ),
      await planOf(
        'handed over | 20 entries, 100,000 entries',
        handedOverEntriesStatement(corbeilleId, 20),
        { write: true, organizationId: corbeilleId },
      ),
      await planOf(
        'due | 20 entries, 100,000 entries',
        dueEntriesStatement(corbeilleId, dueBefore, 20),
        { write: true, organizationId: corbeilleId },
      ),
    ];
    // Another purge job holds all but 100 of the entries: the statement walks past them.
    const lockers: readonly (readonly [string, SQL, SQL, number])[] = [
      [
        'handed over',
        handedOverEntriesStatement(atelierNordId, handed - 100),
        handedOverEntriesStatement(atelierNordId, 20),
        handed,
      ],
      [
        'due',
        dueEntriesStatement(atelierNordId, dueBefore, due - 100),
        dueEntriesStatement(atelierNordId, dueBefore, 20),
        due,
      ],
    ];
    const skipped: PlanLine[] = [];
    for (const [label, lock, read, count] of lockers) {
      const other = await application.connect();
      try {
        await other.query('begin');
        await other.query('select set_config($1, $2, true), set_config($3, $4, true)', [
          'app.organization_id',
          atelierNordId,
          'app.system_access',
          'off',
        ]);
        const query = new PgDialect().sqlToQuery(lock);
        const locked = await other.query(query.sql, query.params);
        expect(locked.rows).toHaveLength(count - 100);
        const taken = await planOf(
          `${label} | 20 entries with ${String(count - 100)} of ${String(count)} locked by another transaction (skip locked)`,
          read,
          { write: true },
        );
        skipped.push(taken);
      } finally {
        await other.query('rollback');
        other.release();
      }
    }
    for (const plan of [...plans, ...skipped]) {
      console.info(lineOf(plan));
    }
    expect(seqScansOf([...plans, ...skipped], ['tasks', 'trash_entries'])).toEqual([]);
    for (const plan of [...plans, ...skipped]) {
      expect(plan.nodes.join(' > '), plan.label).toContain('LockRows');
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    for (const plan of plans.filter((entry) => entry.label.startsWith('handed over'))) {
      expect(plan.indexes, plan.label).toContain('trash_entries_purge_requested_index');
    }
    for (const plan of [...plans, ...skipped].filter((entry) => entry.label.startsWith('due'))) {
      expect(plan.indexes, plan.label).toContain('trash_entries_trashed_index');
    }
  }, 300_000);

  it('(5) finds the organizations with something to purge with one probe per branch, among 500 organizations of which a few are due, in a system transaction', async () => {
    const dueBefore = new Date(Date.now() - 30 * 24 * 3_600_000);
    const client = await application.connect();
    const taken: PlanLine[] = [];
    const first: string[] = [];
    try {
      await client.query('begin read only');
      await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
        'app.organization_id',
        '',
        'app.system_access',
        'on',
      ]);
      const firstQuery = queryOf(organizationsWithTrashStatement(dueBefore, null, 1_000));
      first.push(
        ...(
          await client.query<{ readonly organizationId: string }>(firstQuery.sql, firstQuery.params)
        ).rows.map((row) => row.organizationId),
      );
      const middle = first[Math.floor(first.length / 2)] ?? null;
      const last = first.at(-1) ?? null;
      const cases: readonly (readonly [string, string | null, number])[] = [
        ['first page of 1,000', null, 1_000],
        ['page after the middle', middle, 1_000],
        ['page after the last', last, 1_000],
        ['page of 10', null, 10],
      ];
      for (const [label, after, limit] of cases) {
        const document = await explain(
          client,
          queryOf(organizationsWithTrashStatement(dueBefore, after, limit)),
          true,
        );
        taken.push(summarize(`organizations scan | ${label}`, document));
      }
    } finally {
      await client.query('rollback');
      client.release();
    }
    everyPlan.push(...taken);
    const [{ expected } = { expected: 0 }] = await asSystem<{ readonly expected: number }>(
      `select count(distinct organization_id)::int as expected from trash_entries
        where purge_requested_at is not null or trashed_at <= $1`,
      [dueBefore],
    );
    for (const plan of taken) {
      console.info(lineOf(plan));
    }
    console.info(`trash plans: ${String(first.length)} organizations to purge among the table's`);
    expect(first).toHaveLength(expected);
    expect(first.length).toBeGreaterThan(8);
    expect(first.length).toBeLessThan(40);
    expect([...first].sort()).toEqual([...first]);
    for (const plan of taken) {
      expect(plan.seqScans, plan.label).toEqual([]);
      expect(plan.indexes, plan.label).toEqual(
        expect.arrayContaining([
          'trash_entries_purge_requested_index',
          'trash_entries_trashed_index',
        ]),
      );
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
  }, 300_000);

  it('(6) erases an entry of one task and an entry of 651 tasks through the indexes of their tables, and checks the foreign keys through indexes', async () => {
    const plans: PlanLine[] = [];
    for (const [label, entryId] of [
      ['1 task', oneEntryId],
      ['651 tasks', bigEntryId],
    ] as const) {
      const statements = eraseEntriesStatements(atelierNordId, [entryId]);
      const lines = await measure(
        `erase | entry of ${label}`,
        async (db) => {
          for (const statement of statements) {
            await db.execute(statement);
          }
        },
        { write: true },
      );
      plans.push(...lines);
    }
    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    expect(plans).toHaveLength(14);
    expect(
      seqScansOf(plans, [
        'tasks',
        'activity_entries',
        'checklist_items',
        'task_assignees',
        'task_labels',
      ]),
    ).toEqual([]);
    for (const plan of plans) {
      expect(plan.milliseconds, plan.label).toBeLessThan(5_000);
      expect(plan.triggerMilliseconds, plan.label).toBeLessThan(2_000);
    }
  }, 300_000);

  it('(7) reads the first batch of candidate roots of a list whose oldest roots are in the trash, and a keyset batch, in a range of tasks_list_created_index, without roots already in the trash', async () => {
    const first = await rowsOf<{ readonly id: string; readonly createdAt: string }>(
      trashCandidateRootsStatement(atelierNordId, largeListId, null, 50),
    );
    const last = first.at(-1);
    const after = { createdAt: new Date(last?.createdAt ?? ''), id: last?.id ?? '' };
    const trashedAmong = await asSystem<{ readonly count: number }>(
      `select count(*)::int as count from tasks where organization_id = $1 and id = any($2::uuid[])
          and trash_entry_id is not null`,
      [atelierNordId, first.map((row) => row.id)],
    );
    const plans: PlanLine[] = [
      await planOf(
        'candidate roots | first batch, 12,000 of 16,000 roots trashed',
        trashCandidateRootsStatement(atelierNordId, largeListId, null, 50),
      ),
      await planOf(
        'candidate roots | keyset batch after the first',
        trashCandidateRootsStatement(atelierNordId, largeListId, after, 50),
      ),
      await planOf(
        'candidate roots | first batch of the deleted list of 6,600 tasks',
        trashCandidateRootsStatement(atelierNordId, deletedListId, null, 50),
      ),
      ...(await measure(
        'trash trees | the 50 roots of the first batch of the large list (trashTrees)',
        (db) =>
          new DrizzleTaskRepository(db).trashTrees(
            atelierNordId,
            first.map((row) => row.id),
          ),
      )),
    ];
    const deletedRoots = await rowsOf<{ readonly id: string }>(
      trashCandidateRootsStatement(atelierNordId, deletedListId, null, 50),
    );
    plans.push(
      ...(await measure(
        'trash trees | the 50 roots of the deleted list of trees of 11 tasks (trashTrees)',
        (db) =>
          new DrizzleTaskRepository(db).trashTrees(
            atelierNordId,
            deletedRoots.map((row) => row.id),
          ),
      )),
    );
    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    console.info(
      `trash plans: the first batch holds ${String(first.length)} candidate roots, ${String(trashedAmong[0]?.count ?? -1)} of them in the trash`,
    );
    expect(first).toHaveLength(50);
    expect(seqScansOf(plans, ['tasks'])).toEqual([]);
    for (const plan of plans) {
      expect(plan.indexes.join(','), plan.label).toContain('tasks_');
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    // A candidate is a task out of the trash: the first batch skips the roots of the 12,000 entries.
    expect(trashedAmong[0]?.count).toBe(0);
  }, 300_000);

  it('(8) writes 1,150 tasks to the trash in one statement and locks the tasks of an entry in one ordered statement', async () => {
    const live = await asSystem<{ readonly id: string }>(
      `select id::text as id from tasks
        where organization_id = $1 and list_id = $2 and trash_entry_id is null and archived_at is null
        order by created_at, id limit 1150`,
      [atelierNordId, largeListId],
    );
    expect(live).toHaveLength(1_150);
    const ids = live.map((row) => row.id);
    const taken: PlanLine[] = [];
    await inTenant(async (_db, client) => {
      const captured: CapturedStatement[] = [];
      const logged = drizzle({
        client,
        logger: {
          logQuery: (query: string, params: unknown[]): void => {
            captured.push({ sql: query, params });
          },
        },
      });
      const tasks = new DrizzleTaskRepository(logged);
      const now = new Date();
      const drafts: TrashEntryDraft[] = Array.from({ length: 50 }, (_unused, chunk) => ({
        organizationId: atelierNordId,
        rootTaskId: ids[chunk * 23] ?? '',
        listId: largeListId,
        parentKey: null,
        taskCount: 23,
        trashedAt: now,
        trashedBy: { type: 'user', id: camille.userId },
      }));
      const records: readonly TrashEntryRecord[] = await new DrizzleTrashEntryRepository(
        logged,
      ).insertMany(drafts);
      const entryOf = new Map<string, string>();
      for (const [index, id] of ids.entries()) {
        entryOf.set(id, records[Math.floor(index / 23)]?.id ?? '');
      }
      captured.length = 0;
      const locked: readonly Task[] = await tasks.lockByIds(atelierNordId, ids, false);
      const lockStatements = captured.length;
      const trashed = locked.map((task) => task.trash(entryOf.get(task.snapshot.id) ?? '', now));
      const write = queryOf(
        writeTrashStatement(
          atelierNordId,
          trashed.map((task) => task.snapshot),
          locked.map((task) => task.snapshot.version),
        ),
      );
      await client.query('savepoint bulk_write');
      await client.query(write.sql, write.params);
      await client.query('rollback to savepoint bulk_write');
      taken.push(
        summarize(
          'bulk write | 1,150 tasks of 50 entries (writeTrashStatement)',
          await explain(client, write, false),
        ),
      );
      for (const [index, statement] of captured.slice(0, lockStatements).entries()) {
        taken.push(
          summarize(
            `bulk write | lock of 1,150 tasks by id (lockByIds ${String(index + 1)})`,
            await explain(client, statement, true),
          ),
        );
      }
      expect(locked).toHaveLength(1_150);
    });
    const entryLocks: PlanLine[] = [
      ...(await measure('entry lock | members of the entry of 651 tasks, FOR NO KEY UPDATE', (db) =>
        new DrizzleTaskRepository(db).lockTrashEntries(atelierNordId, [bigEntryId], false),
      )),
      ...(await measure(
        'entry lock | members of the entry of 651 tasks, FOR UPDATE (erasure)',
        (db) => new DrizzleTaskRepository(db).lockTrashEntries(atelierNordId, [bigEntryId], true),
      )),
      ...(await measure(
        'entry lock | members of two entries at once (one task and 651 tasks), FOR UPDATE',
        (db) =>
          new DrizzleTaskRepository(db).lockTrashEntries(
            atelierNordId,
            [oneEntryId, bigEntryId],
            true,
          ),
      )),
      ...(await measure('entry lock | the entry row FOR UPDATE with its root (lock)', (db) =>
        new DrizzleTrashEntryRepository(db).lock(atelierNordId, bigEntryId),
      )),
    ];
    everyPlan.push(...taken);
    for (const plan of [...taken, ...entryLocks]) {
      console.info(lineOf(plan));
    }
    expect(seqScansOf([...taken, ...entryLocks], ['tasks', 'trash_entries'])).toEqual([]);
    for (const plan of [...taken, ...entryLocks]) {
      expect(plan.milliseconds, plan.label).toBeLessThan(3_000);
    }
    for (const plan of entryLocks.filter(
      (entry) => entry.label.includes('members') && entry.label.endsWith('(1)'),
    )) {
      expect(plan.indexes, `${plan.label}: ${plan.nodes.join(' > ')}`).toContain(
        'tasks_trash_entry_index',
      );
    }
  }, 300_000);

  it('(9) drops the pending requests of tasks, of a list and of a space through the pending indexes, with 5,000 pending requests of 300 requesters, and measures a candidate index', async () => {
    const [listTarget] = await asSystem<{ readonly list_id: string }>(
      `select list_id::text as list_id from access_requests
        where organization_id = $1 and target = 'list' and state = 'pending' and space_id <> $2
        group by list_id order by count(*) desc, list_id limit 1`,
      [atelierNordId, milleSpaceId],
    );
    const cases: readonly (readonly [string, DroppedRequestTarget])[] = [
      ['651 tasks', { kind: 'tasks', taskIds: bigTaskIds }],
      ['one task', { kind: 'tasks', taskIds: bigTaskIds.slice(0, 1) }],
      ['a list of 30 requests', { kind: 'list', listId: listTarget?.list_id ?? '' }],
      ['a space of 1,000 lists', { kind: 'space', spaceId: milleSpaceId }],
    ];
    const baseline: PlanLine[] = [];
    const withCandidate: PlanLine[] = [];
    const dropped: number[] = [];
    for (const [name, target] of cases) {
      baseline.push(
        ...(await measure(
          `drop pending requests | ${name}`,
          async (db) => {
            dropped.push(
              await new DrizzleAccessRequestRepository(db).deletePendingOf(atelierNordId, target),
            );
          },
          { write: true },
        )),
      );
      withCandidate.push(
        ...(await measure(
          `drop pending requests | ${name} | with (organization_id, target, target_id) where pending`,
          async (db) => {
            await new DrizzleAccessRequestRepository(db).deletePendingOf(atelierNordId, target);
          },
          {
            write: true,
            migrator: true,
            prepare: async (client) => {
              await client.query(
                `create index access_requests_pending_target_candidate on access_requests (organization_id, target, target_id) where state = 'pending'`,
              );
            },
          },
        )),
      );
    }
    for (const plan of [...baseline, ...withCandidate]) {
      console.info(lineOf(plan));
    }
    console.info(`trash plans: the drops deleted ${dropped.join(', ')} pending requests`);
    expect(baseline).toHaveLength(cases.length);
    expect(dropped[0]).toBeGreaterThan(100);
    expect(dropped[1]).toBe(1);
    expect(dropped[2]).toBeGreaterThanOrEqual(30);
    expect(dropped[3]).toBeGreaterThanOrEqual(20);
    expect(seqScansOf(baseline, ['tasks'])).toEqual([]);
    for (const plan of baseline) {
      expect(plan.milliseconds, plan.label).toBeLessThan(1_000);
    }
  }, 300_000);

  it('(10) reads the lists a member may restore, tombstones included, for an admin, a member and a guest among 3,000 lists', async () => {
    const plans: PlanLine[] = [];
    for (const [name, viewer] of [
      ['owner', asOwner],
      ['admin', asAdmin],
      ['member', asMember],
      ['guest', asGuest],
    ] as const) {
      plans.push(
        ...(await measure(`trash lists | ${name} (listTrashAccessesVisibleTo)`, (db) =>
          new DrizzleTaskListRepository(db).listTrashAccessesVisibleTo(atelierNordId, viewer),
        )),
        ...(await measure(`visible lists | ${name} (listAccessesVisibleTo, tombstones out)`, (db) =>
          new DrizzleTaskListRepository(db).listAccessesVisibleTo(atelierNordId, viewer),
        )),
      );
    }
    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    expect(seqScansOf(plans, ['tasks'])).toEqual([]);
    for (const plan of plans) {
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    const guestRows = plans.filter((plan) => plan.label.includes('guest'));
    for (const plan of guestRows) {
      expect(plan.indexes.join(','), plan.label).toContain('list_grants_user_index');
    }
  }, 300_000);

  it('(11) pages the spaces by (coalesce(restored_at, created_at), id) and finds the spaces of a guest through list grants, tombstones included', async () => {
    await asSystem(
      `update spaces set restored_at = created_at + interval '200 days'
        where organization_id = $1 and name like 'Volume %' and prefix = 'VOL' and created_at < timestamptz '2026-01-05 08:00+00' + interval '1000 seconds'`,
      [atelierNordId],
    );
    const plans: PlanLine[] = [];
    for (const [name, viewer] of [
      ['owner', asOwner],
      ['admin', asAdmin],
      ['member', asMember],
      ['guest', asGuest],
    ] as const) {
      const page = await inTenant((db) =>
        new DrizzleSpaceRepository(db).listVisible(atelierNordId, viewer, null, 51),
      );
      const last = page.at(-1)?.space.snapshot;
      plans.push(
        ...(await measure(`spaces page 1 | ${name}`, (db) =>
          new DrizzleSpaceRepository(db).listVisible(atelierNordId, viewer, null, 51),
        )),
      );
      if (page.length === 51 && last !== undefined) {
        plans.push(
          ...(await measure(`spaces page 2 | ${name}`, (db) =>
            new DrizzleSpaceRepository(db).listVisible(
              atelierNordId,
              viewer,
              { createdAt: last.restoredAt ?? last.createdAt, id: last.id },
              51,
            ),
          )),
        );
      }
      plans.push(
        ...(await measure(`spaces all | ${name} (listAllVisible)`, (db) =>
          new DrizzleSpaceRepository(db).listAllVisible(atelierNordId, viewer),
        )),
      );
    }
    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    for (const plan of plans) {
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    for (const plan of plans.filter((entry) => entry.label.includes('guest'))) {
      expect(plan.indexes, plan.label).toContain('list_grants_user_index');
    }
  }, 300_000);

  it('(12) erases a deleted space with its lists and grants and prices the foreign key checks of the delete of the lists and of the space', async () => {
    const spaceId = oldSpaceIds[0] ?? '';
    const listIds = oldListIds.slice(0, 10);
    const plans = await measure(
      'erase space | 10 lists with 11 grants each, 20 space grants',
      async (db) => {
        const grants = new DrizzleGrantRepository(db);
        const lists = new DrizzleTaskListRepository(db);
        for (const listId of listIds) {
          await grants.eraseOfList(atelierNordId, listId);
          await lists.erase(atelierNordId, listId);
        }
        await grants.eraseOfSpace(atelierNordId, spaceId);
        await new DrizzleSpaceRepository(db).erase(atelierNordId, spaceId);
      },
      { write: true },
    );
    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    // The check PostgreSQL runs on list_grants when a space is deleted, planned alone: the query of
    // the foreign key list_grants_space_fkey, then the same with an index led by the space.
    const check = sql`select 1 from only list_grants as x where x.organization_id = ${atelierNordId}::uuid and x.space_id = ${spaceId}::uuid for key share of x`;
    const checks: PlanLine[] = [
      await planOf('fk check | list_grants by (organization_id, space_id)', check, { write: true }),
      await planOf(
        'fk check | list_grants by (organization_id, space_id), with an index (organization_id, space_id)',
        check,
        {
          write: true,
          migrator: true,
          prepare: async (client) => {
            await client.query(
              'create index list_grants_space_candidate on list_grants (organization_id, space_id)',
            );
          },
        },
      ),
    ];
    for (const plan of checks) {
      console.info(lineOf(plan));
    }
    expect(plans).toHaveLength(2 * listIds.length + 2);
    expect(plans.at(-1)?.triggers.length).toBeGreaterThan(0);
    expect.soft(seqScansOf(checks.slice(0, 1), ['list_grants'])).toEqual([]);
    expect(seqScansOf(checks.slice(1), ['list_grants'])).toEqual([]);
    for (const plan of plans) {
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
  }, 300_000);

  it('(13) reads the first page in creation order of a list whose 15,000 oldest tasks are in the trash, and measures a partial index of the live tasks', async () => {
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
        'large list: page level all',
        pageStatement(
          atelierNordId,
          largeListId,
          { ...emptyFilter, rootsOnly: false },
          manual,
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
    ];
    const candidate =
      'create index tasks_live_list_created_candidate on tasks (organization_id, list_id, created_at, id) where archived_at is null and trash_entry_id is null';
    const take = async (withCandidate: boolean): Promise<PlanLine[]> => {
      const taken: PlanLine[] = [];
      await inTenant(
        async (_db, client) => {
          for (const [label, statement] of probes) {
            taken.push(summarize(label, await explain(client, queryOf(statement), true)));
          }
        },
        {
          migrator: true,
          prepare: async (client) => {
            if (withCandidate) {
              await client.query(candidate);
            }
          },
        },
      );
      return taken;
    };
    const baseline = await take(false);
    const candidates = await take(true);
    const [leftover] = (
      await migrator.query<{ readonly count: number }>(
        `select count(*)::int as count from pg_indexes where indexname like 'tasks_live%candidate'`,
      )
    ).rows;
    const cell = (plan: PlanLine | undefined): string =>
      plan === undefined
        ? '?'
        : `${plan.indexes.join(', ') || plan.seqScans.join(', ')} ${String(plan.blocks)} buffers ${plan.milliseconds.toFixed(3)} ms, removed by filter ${String(plan.removed.tasks ?? 0)}`;
    console.info(
      probes
        .map(
          ([label], index) =>
            `trash partial index | ${label} | without: ${cell(baseline[index])} | with the live-only index: ${cell(candidates[index])}`,
        )
        .join('\n'),
    );
    everyPlan.push(...baseline);
    expect(baseline).toHaveLength(probes.length);
    expect(candidates).toHaveLength(probes.length);
    expect(leftover?.count).toBe(0);
    expect(seqScansOf(baseline, ['tasks'])).toEqual([]);
    for (const plan of baseline) {
      expect(plan.indexes, plan.label).toContain('tasks_list_created_index');
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
  }, 600_000);

  it('(14) marks the 1,000 lists of a deleted space in one statement of the range of the space', async () => {
    const plans = await measure(
      'mark lists of a deleted space | 1,000 lists (markDeletedWithSpace)',
      async (db) => {
        await new DrizzleTaskListRepository(db).markDeletedWithSpace(
          atelierNordId,
          milleSpaceId,
          { type: 'user', id: camille.userId },
          new Date(),
        );
      },
      { write: true },
    );
    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    expect(plans).toHaveLength(1);
    expect(plans[0]?.indexes.join(','), plans[0]?.nodes.join(' > ')).toContain(
      'lists_organization_space_created_index',
    );
    expect(plans[0]?.milliseconds).toBeLessThan(1_000);
  }, 300_000);

  describe('(15) one batch of the deletion job and one batch of the purge job, through the repositories of src', () => {
    /**
     * A tasks unit of work over a transaction already open: the repositories of the real unit of
     * work, the events through the real adapter over an outbox write of the same two statements as
     * the kit's, the jobs counted.
     *
     * @param db - The Drizzle database of the transaction, with its logger.
     * @param client - Its client.
     * @param counts - Receives the events appended and the jobs enqueued.
     * @returns The unit of work.
     */
    function unitOfWorkOver(
      db: TransactionDatabase,
      client: pg.PoolClient,
      counts: { events: number; jobs: number; names: Record<string, number> },
    ): TasksUnitOfWork {
      const outbox = {
        append: async (
          _scope: unknown,
          _schemas: unknown,
          name: string,
          data: { organizationId?: unknown } & Record<string, unknown>,
        ): Promise<{ id: string; occurredAt: string }> => {
          const assigned = await db.execute<{ id: string; occurred_at: string }>(
            sql`select uuidv7()::text as id, to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as occurred_at`,
          );
          const row = assigned.rows[0];
          counts.names[name] = (counts.names[name] ?? 0) + 1;
          await db.execute(
            sql`insert into outbox_events (id, event_name, subject, stream, organization_id, payload, traceparent)
                values (${row?.id ?? ''}::uuid, ${name}, ${`task.${name}`}, 'EVENTS', ${String(data.organizationId)}::uuid, ${JSON.stringify(data)}::jsonb, null)`,
          );
          return { id: row?.id ?? '', occurredAt: row?.occurred_at ?? '' };
        },
      };
      const store = (): TasksStore => ({
        tasks: new DrizzleTaskRepository(db),
        reader: new DrizzleTaskReader(db),
        activity: new DrizzleActivityRepository(db),
        queries: new DrizzleTaskQueryReader(db),
        counter: new DrizzleTaskCounter(db),
        assigned: new DrizzleAssignedTaskReader(db),
        labels: new DrizzleLabelReader(db),
        archives: new DrizzleArchiveReader(db),
        trash: new DrizzleTrashEntryRepository(db),
        jobs: {
          dropTrashedTaskRequests: (): Promise<void> => {
            counts.jobs += 1;
            return Promise.resolve();
          },
          purgeTrash: (): Promise<void> => {
            counts.jobs += 1;
            return Promise.resolve();
          },
        },
        events: new OutboxTaskEvents(
          { db, client, kind: 'tenant', organizationId: atelierNordId },
          outbox as unknown as ConstructorParameters<typeof OutboxTaskEvents>[1],
          (): void => {
            counts.events += 1;
          },
        ),
        clock: new PostgresqlTransactionClock(db),
      });
      return {
        run: async (work) => work(store()),
        runReadOnly: async (work) => work(store()),
      };
    }

    /**
     * The spaces module as the batches use it, over the repositories of spaces: the list held
     * `FOR SHARE`, the lists of the trash locked with their spaces, and a deleted list erased with
     * its grants, then its space when it holds no list.
     *
     * @param db - The Drizzle database of the transaction.
     * @returns The directory.
     */
    function spacesOver(db: TransactionDatabase): SpaceDirectory {
      const lists = new DrizzleTaskListRepository(db);
      const spaces = new DrizzleSpaceRepository(db);
      const grants = new DrizzleGrantRepository(db);
      return {
        // As the use case LockDeletedList does it: the list read without a lock; a live or unknown
        // one takes none; a deleted one has its space locked FOR NO KEY UPDATE, then itself
        // FOR UPDATE, and is read again.
        lockDeletedList: async (organizationId: string, listId: string) => {
          const seen = await lists.findIncludingDeleted(organizationId, listId);
          if (seen === null) {
            return { outcome: 'not-found' };
          }
          if (!seen.isDeleted) {
            return { outcome: 'live' };
          }
          await spaces.lockIncludingDeleted(organizationId, seen.snapshot.spaceId, 'update');
          const locked = await lists.lockIncludingDeleted(organizationId, listId, 'delete');
          if (locked === null) {
            return { outcome: 'not-found' };
          }
          return { outcome: locked.isDeleted ? 'deleted' : 'live' };
        },
        // As the use case LockTrashLists does it, over the same repository calls: every list found,
        // live or deleted, locked after its space (FOR SHARE to hold, FOR NO KEY UPDATE then
        // FOR UPDATE to erase), then the role of the viewer read again.
        lockTrashLists: async (
          organizationId: string,
          listIds: readonly string[],
          mode: 'hold' | 'erase',
          viewer: Viewer | null,
        ) => {
          const unique = [...new Set(listIds)];
          if (unique.length === 0) {
            return [];
          }
          const seen = await lists.findManyIncludingDeleted(organizationId, unique);
          await spaces.lockInOrder(
            organizationId,
            [...new Set(seen.map((list) => list.snapshot.spaceId))].map((id) => ({
              id,
              mode: mode === 'hold' ? ('share' as const) : ('update' as const),
            })),
          );
          const locked = new Map(
            (
              await lists.lockMany(
                organizationId,
                seen.map((list) => list.snapshot.id),
                mode === 'hold' ? 'share' : 'delete',
              )
            ).map((list) => [list.snapshot.id, list]),
          );
          const roles = new Map<string, string>();
          if (viewer !== null && locked.size > 0) {
            for (const row of await lists.listTrashAccessesVisibleTo(organizationId, viewer)) {
              const role = locked.has(row.listId)
                ? listRoleAsIfNotDeletedOf(
                    row.space,
                    { organizationAccess: row.organizationAccess },
                    viewer,
                    row.grants,
                  )
                : null;
              if (role !== null) {
                roles.set(row.listId, role);
              }
            }
          }
          return unique.map((listId) => {
            const list = locked.get(listId);
            if (list === undefined) {
              return { listId, outcome: 'not-found', role: null };
            }
            return {
              listId,
              outcome: list.isDeleted ? 'deleted' : 'live',
              role: roles.get(listId) ?? null,
            };
          });
        },
        holdList: async (organizationId: string, listId: string) => {
          const list = await lists.lockIncludingDeleted(organizationId, listId, 'share');
          const state = list?.snapshot;
          if (state === undefined) {
            return { outcome: 'not-found' };
          }
          return state.deletedBy === null
            ? { outcome: 'live' }
            : { outcome: 'deleted', deletedBy: state.deletedBy };
        },
        // As the use case PurgeDeletedList does it: the list read without a lock, then its space
        // locked FOR NO KEY UPDATE before the list FOR UPDATE, then the space erased with its last
        // list.
        purgeDeletedList: async (organizationId: string, listId: string) => {
          const seen = await lists.findIncludingDeleted(organizationId, listId);
          if (seen === null) {
            return { outcome: 'not-found' };
          }
          if (!seen.isDeleted) {
            return { outcome: 'not-deleted' };
          }
          const space = await spaces.lockIncludingDeleted(
            organizationId,
            seen.snapshot.spaceId,
            'update',
          );
          const state = (await lists.lockIncludingDeleted(organizationId, listId, 'delete'))
            ?.snapshot;
          if (space === null || state === undefined) {
            return { outcome: 'not-found' };
          }
          if (state.deletedAt === null) {
            return { outcome: 'not-deleted' };
          }
          await grants.eraseOfList(organizationId, listId);
          await lists.erase(organizationId, listId);
          const spaceState = (
            await spaces.lockIncludingDeleted(organizationId, state.spaceId, 'delete')
          )?.snapshot;
          if (
            spaceState?.deletedAt !== null &&
            spaceState !== undefined &&
            !(await lists.anyOfSpace(organizationId, state.spaceId))
          ) {
            await grants.eraseOfSpace(organizationId, state.spaceId);
            await spaces.erase(organizationId, state.spaceId);
            return { outcome: 'purged', spacePurged: true };
          }
          return { outcome: 'purged', spacePurged: false };
        },
      } as unknown as SpaceDirectory;
    }

    /**
     * Runs a batch of a use case in a rolled-back transaction of an organization and counts what it
     * sent.
     *
     * @param label - What the batch is.
     * @param organizationId - The organization.
     * @param run - The batch, with the unit of work and the spaces.
     * @returns The line of the report and what the batch returned.
     */
    async function batch<TResult>(
      label: string,
      organizationId: string,
      run: (unitOfWork: TasksUnitOfWork, spaces: SpaceDirectory) => Promise<TResult>,
    ): Promise<{
      readonly line: string;
      readonly result: TResult | string;
      readonly statements: number;
      readonly milliseconds: number;
    }> {
      const captured: CapturedStatement[] = [];
      const counts = { events: 0, jobs: 0, names: {} as Record<string, number> };
      const timed = await inTenant(
        async (db, client) => {
          const started = performance.now();
          let result: TResult | string;
          try {
            result = await run(unitOfWorkOver(db, client, counts), spacesOver(db));
          } catch (error) {
            // The batch fails as a whole: the transaction is rolled back below, the report says why.
            result = `failed: ${error instanceof Error ? error.message.slice(0, 300) : 'unknown error'}`;
          }
          return { result, milliseconds: Math.round((performance.now() - started) * 10) / 10 };
        },
        { organizationId },
        captured,
      );
      const kinds = new Map<string, number>();
      for (const statement of captured) {
        const kind = statement.sql.trim().split(/\s+/u).slice(0, 2).join(' ').toLowerCase();
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
      return {
        line: `trash batch | ${label} | ${timed.milliseconds.toFixed(1)} ms | ${String(captured.length)} statements of which ${String(2 * counts.events)} write the ${String(counts.events)} events (${[...kinds].map(([kind, count]) => `${kind} ${String(count)}`).join(', ')}) | ${String(counts.events)} events (${JSON.stringify(counts.names)}), ${String(counts.jobs)} jobs | ${JSON.stringify(timed.result)}`,
        result: timed.result,
        statements: captured.length - 2 * counts.events,
        milliseconds: timed.milliseconds,
      };
    }

    it('trashes up to 500 tasks of a deleted list in a batch, and erases up to 20 entries or 500 tasks in a purge batch, in a few dozen statements and well under a second', async () => {
      const first = await batch(
        'deletion batch 1 | deleted list of 6,600 tasks',
        atelierNordId,
        (unitOfWork, spaces) =>
          new TrashDeletedListTasks(unitOfWork, spaces).execute({
            organizationId: atelierNordId,
            listId: deletedListId,
            after: null,
          }),
      );
      const candidates = await rowsOf<{ readonly id: string; readonly createdAt: string }>(
        trashCandidateRootsStatement(atelierNordId, deletedListId, null, 50),
      );
      const middle = candidates.at(-1);
      const keyset = await batch(
        'deletion batch | keyset batch after 50 roots',
        atelierNordId,
        (unitOfWork, spaces) =>
          new TrashDeletedListTasks(unitOfWork, spaces).execute({
            organizationId: atelierNordId,
            listId: deletedListId,
            after: { createdAt: new Date(middle?.createdAt ?? ''), id: middle?.id ?? '' },
          }),
      );
      const large = await batch(
        'deletion batch | large list, 12,000 roots already in the trash',
        atelierNordId,
        (unitOfWork, spaces) =>
          new TrashDeletedListTasks(unitOfWork, spaces).execute({
            organizationId: atelierNordId,
            listId: largeListId,
            after: null,
          }),
      );
      const handedOver = await batch(
        'purge batch | Atelier Nord, entries handed over',
        atelierNordId,
        (unitOfWork, spaces) =>
          new PurgeTrashBatch(unitOfWork, spaces).execute({ organizationId: atelierNordId }),
      );
      const due = await batch(
        'purge batch | Atelier Delta, the entry of 651 tasks first (erased whole, alone)',
        atelierDeltaId,
        (unitOfWork, spaces) =>
          new PurgeTrashBatch(unitOfWork, spaces).execute({ organizationId: atelierDeltaId }),
      );
      const chunks = await batch(
        'purge batch | Atelier Delta, the entry of 651 tasks, then the next batch, in one transaction',
        atelierDeltaId,
        async (unitOfWork, spaces) => {
          const purge = new PurgeTrashBatch(unitOfWork, spaces);
          return [
            await purge.execute({ organizationId: atelierDeltaId }),
            await purge.execute({ organizationId: atelierDeltaId }),
          ];
        },
      );
      for (const entry of [first, keyset, large, handedOver, due, chunks]) {
        console.info(entry.line);
      }
      expect(first.result).toMatchObject({ outcome: 'trashed' });
      expect(keyset.result).toMatchObject({ outcome: 'trashed' });
      expect(large.result).toMatchObject({ outcome: 'trashed' });
      expect(handedOver.result).toMatchObject({ outcome: 'purged' });
      // An entry larger than the budget of 500 tasks that comes first is taken alone and erased
      // whole by one batch, its 651 tasks with it; the next batch takes the entries after it.
      expect(due.result).toMatchObject({ outcome: 'purged', entries: 1, tasks: 651 });
      expect(chunks.result).toMatchObject([
        { outcome: 'purged', entries: 1, tasks: 651 },
        { outcome: 'purged' },
      ]);
      for (const entry of [first, keyset, large, handedOver, due, chunks]) {
        expect(entry.milliseconds, entry.line).toBeLessThan(5_000);
        expect(entry.statements, entry.line).toBeLessThan(120);
      }
    }, 300_000);

    it('locks the lists of an erasure, live or deleted, in one global order: the spaces then the lists, by id, reading the lists first without a lock', async () => {
      const lockers: readonly (readonly [string, readonly string[]])[] = [
        ['one deleted list', oldListIds.slice(0, 1)],
        ['30 deleted lists of 3 deleted spaces', oldListIds],
        [
          '100 lists: 30 deleted, 70 live (the live ones locked too)',
          [...oldListIds, ...allLists.slice(0, 70)],
        ],
      ];
      const plans: PlanLine[] = [];
      for (const [label, listIds] of lockers) {
        plans.push(
          ...(await measure(`lock trash lists | ${label}`, (db) =>
            spacesOver(db).lockTrashLists(atelierNordId, listIds, 'erase', null),
          )),
        );
      }
      for (const plan of plans) {
        console.info(lineOf(plan));
      }
      expect(plans.length).toBeGreaterThanOrEqual(lockers.length);
      expect(seqScansOf(plans, ['tasks'])).toEqual([]);
      for (const plan of plans) {
        expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
      }
    }, 300_000);
  });

  it('(extra 2) probes a deleted list of 20,000 tasks all in the trash for a task out of it, reads a task by key under FOR SHARE SKIP LOCKED, and erases an oversized entry whole as one purge batch does', async () => {
    const lists: readonly (readonly [string, string, string])[] = [
      ['all 20,000 tasks in the trash', atelierDeltaId, fullTrashListId],
      ['15,000 of 20,000 tasks in the trash', atelierNordId, largeListId],
      ['list of 6,600 tasks none of them in the trash', atelierNordId, deletedListId],
    ];
    const probes: PlanLine[] = [];
    for (const [label, organizationId, listId] of lists) {
      probes.push(
        await planOf(
          `lists with tasks | ${label}, any task (listsWithTasks)`,
          listsWithTasksStatement(organizationId, [listId]),
          { organizationId },
        ),
        await planOf(
          `lists with tasks | ${label}, out of the trash only (listsWithUntrashedTasks)`,
          listsWithTasksStatement(organizationId, [listId], true),
          { organizationId },
        ),
      );
    }
    const found = await Promise.all(
      lists.map(async ([, organizationId, listId]) =>
        rowsOf<{ readonly listId: string }>(
          listsWithTasksStatement(organizationId, [listId], true),
          organizationId,
        ),
      ),
    );
    const reference = await measure(
      'task reference | read by key FOR SHARE SKIP LOCKED (shareLocationUnlessLocked)',
      (db) =>
        new DrizzleTaskRepository(db).shareLocationUnlessLocked(
          atelierNordId,
          TaskKey.parse('VOL-12'),
        ),
    );
    // A purge batch takes an entry of more than 500 tasks alone and erases it whole: its 651 tasks
    // locked FOR UPDATE in one statement, then the erasure of the entry and of everything of them.
    const oversized = await measure(
      'oversized entry | lock and erasure of the whole entry of 651 tasks, alone in its batch',
      async (db) => {
        await new DrizzleTaskRepository(db).lockTrashEntries(atelierNordId, [bigEntryId], true);
        await new DrizzleTrashEntryRepository(db).erase(atelierNordId, [bigEntryId]);
      },
      { write: true },
    );
    for (const plan of [...probes, ...reference, ...oversized]) {
      console.info(lineOf(plan));
    }
    console.info(
      `trash plans: untrashed tasks found in the lists: ${found.map((rows) => String(rows.length)).join(', ')}`,
    );
    expect(found.map((rows) => rows.length)).toEqual([0, 1, 1]);
    expect(seqScansOf([...probes, ...reference, ...oversized], ['tasks'])).toEqual([]);
    for (const plan of [...probes, ...reference, ...oversized]) {
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    expect(reference[0]?.indexes).toContain('tasks_key_unique');
  }, 300_000);

  it('(extra) reads the untrashed ids of 2,000 tasks by primary key, the deleted lists of a space and the lists of one of 1,000 by their range, and keeps the archives of the organization on their partial indexes with the trash out of them', async () => {
    const ids = (
      await asSystem<{ readonly id: string }>(
        `select id::text as id from tasks where organization_id = $1 and list_id = $2 order by id limit 2000`,
        [atelierNordId, largeListId],
      )
    ).map((row) => row.id);
    const first = await rowsOf<{ readonly id: string; readonly archivedAt: string }>(
      archivedRootsPageStatement(atelierNordId, ownerLists, null, 51),
    );
    const last = first.at(-1);
    const after: ArchivePosition = {
      archivedAt: new Date(last?.archivedAt ?? ''),
      id: last?.id ?? '',
    };
    const plans: PlanLine[] = [
      ...(await measure(
        'untrashed ids | lock FOR SHARE of 2,000 tasks of the large list (lockUntrashedIds)',
        (db) => new DrizzleTaskRepository(db).lockUntrashedIds(atelierNordId, ids),
      )),
      ...(await measure(
        'space lists | deleted lists of a deleted space (listDeletedIdsOfSpace)',
        (db) =>
          new DrizzleTaskListRepository(db).listDeletedIdsOfSpace(
            atelierNordId,
            oldSpaceIds[1] ?? '',
          ),
      )),
      ...(await measure('space lists | any list of a space of 1,000 lists (anyOfSpace)', (db) =>
        new DrizzleTaskListRepository(db).anyOfSpace(atelierNordId, milleSpaceId),
      )),
      await planOf(
        'archives | page 1 of the roots, every list',
        archivedRootsPageStatement(atelierNordId, ownerLists, null, 51),
      ),
      await planOf(
        'archives | page 2 of the roots, every list',
        archivedRootsPageStatement(atelierNordId, ownerLists, after, 51),
      ),
      await planOf(
        'archives | total of the roots, every list',
        archivedRootsCountStatement(atelierNordId, ownerLists),
      ),
      ...(await measure('archives | lock of one archive (lockArchive)', (db) =>
        new DrizzleTaskRepository(db).lockArchive(atelierNordId, first[0]?.id ?? ''),
      )),
    ];
    for (const plan of plans) {
      console.info(lineOf(plan));
    }
    expect(first).toHaveLength(51);
    expect(seqScansOf(plans, ['tasks'])).toEqual([]);
    for (const plan of plans) {
      expect(plan.milliseconds, plan.label).toBeLessThan(2_000);
    }
    for (const plan of plans.filter((entry) => entry.label.startsWith('archives | page'))) {
      expect.soft(plan.indexes, plan.label).toContain('tasks_archive_root_index');
    }
  }, 300_000);

  it('reports the indexes the plans named', () => {
    const used = new Set(everyPlan.flatMap((plan) => plan.indexes));
    console.info(
      `trash plans: ${String(everyPlan.length)} plans as task_app on a tasks table of ${String(tasksBlocks)} blocks; indexes named: ${[...used].sort().join(', ')}`,
    );
    expect(used).toContain('trash_entries_trashed_index');
    expect(used).toContain('trash_entries_purge_requested_index');
    expect(used).toContain('tasks_trash_entry_index');
  });

  describe('deploying migrations/0007_trash.sql holds tables and scans tasks, lists and spaces', () => {
    it('runs the statements of 0007 again under temporary names, as the migrator, in a transaction rolled back: the time of each and of all, and the locks each takes', async () => {
      const statements = readFileSync(trashMigration, 'utf8')
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter((statement) => statement !== '');
      // Every table, column, constraint, index, policy and statistics object 0007 introduces gets a
      // temporary name: the
      // columns are added empty, as on the day of the deploy, beside the ones the seed filled, and
      // the table of the entries is created empty beside the full one.
      const introduced = new Set(
        statements.flatMap((statement) =>
          [
            ...statement.matchAll(
              /(?:ADD COLUMN|ADD CONSTRAINT|CREATE INDEX|CREATE TABLE|CREATE POLICY|CREATE STATISTICS|(?<!DROP )CONSTRAINT) "([a-z_]+)"/gu,
            ),
          ].map((match) => match[1] ?? ''),
        ),
      );
      const probes = statements.map((statement) =>
        statement.replace(/"([a-z_]+)"/gu, (quoted: string, name: string) =>
          introduced.has(name) ? `"${name}_probe"` : quoted,
        ),
      );
      expect(statements.length).toBeGreaterThanOrEqual(20);
      expect(
        probes.filter(
          (probe, index) => probe === statements[index] && !probe.includes('DROP CONSTRAINT'),
        ),
      ).toEqual([]);
      const [volume] = await asSystem<{
        readonly tasks: number;
        readonly lists: number;
        readonly spaces: number;
      }>(
        `select (select count(*)::int from tasks) as tasks, (select count(*)::int from lists) as lists,
                (select count(*)::int from spaces) as spaces`,
      );

      const client = await migrator.connect();
      const timings: {
        readonly statement: string;
        readonly milliseconds: number;
        readonly locks: string;
      }[] = [];
      const watched = ['tasks', 'lists', 'spaces', 'space_prefixes', 'trash_entries_probe'];
      const heldAfter = async (): Promise<Set<string>> => {
        const held = await client.query<{ readonly relation: string; readonly mode: string }>(
          `select c.relname as relation, l.mode from pg_locks as l join pg_class as c on c.oid = l.relation
            where l.pid = pg_backend_pid() and l.locktype = 'relation' and l.granted and c.relname = any($1::text[])`,
          [watched],
        );
        return new Set(held.rows.map((row) => `${row.relation} ${row.mode}`));
      };
      const replay = async (): Promise<{
        readonly total: number;
        readonly locks: readonly string[];
      }> => {
        await client.query('begin');
        let known = await heldAfter();
        const started = performance.now();
        for (const probe of probes) {
          const before = performance.now();
          await client.query(probe);
          const milliseconds = Math.round((performance.now() - before) * 10) / 10;
          const now = await heldAfter();
          timings.push({
            statement: probe.replace(/\s+/gu, ' ').slice(0, 150),
            milliseconds,
            locks: [...now].filter((lock) => !known.has(lock)).join(', ') || '(none new)',
          });
          known = now;
        }
        const total = Math.round(performance.now() - started);
        return { total, locks: [...known].sort() };
      };
      let replayed: Awaited<ReturnType<typeof replay>>;
      // The migration drops the foreign key of the prefixes, which the deploy already did to this
      // database: put it back, committed and outside the timings, for the replay to find it, and
      // drop it again at the end (the throwaway database only; production never gets it back).
      await migrator.query(
        `alter table space_prefixes add constraint space_prefixes_space_fkey foreign key (organization_id, space_id) references spaces (organization_id, id)`,
      );
      try {
        replayed = await replay();
      } finally {
        await client.query('rollback');
        client.release();
        await migrator.query(
          `alter table space_prefixes drop constraint if exists space_prefixes_space_fkey`,
        );
      }
      const { total, locks } = replayed;
      const [leftover] = await asSystem<{ readonly relations: number; readonly columns: number }>(
        `select (select count(*)::int from pg_class where relname like '%\\_probe') as relations,
                (select count(*)::int from information_schema.columns
                  where table_name in ('tasks', 'lists', 'spaces') and column_name like '%\\_probe') as columns`,
      );

      console.info(
        [
          `migration 0007 on ${String(volume?.tasks ?? 0)} tasks, ${String(volume?.lists ?? 0)} lists and ${String(volume?.spaces ?? 0)} spaces: ${String(total)} ms in all (${String(statements.length)} statements)`,
          ...timings.map(
            (timing) =>
              `migration 0007 | ${timing.milliseconds.toFixed(1)} ms | new locks: ${timing.locks} | ${timing.statement}`,
          ),
          `migration 0007 | locks held until the commit: ${locks.join(', ')}`,
        ].join('\n'),
      );
      expect(volume?.tasks).toBeGreaterThan(100_000);
      expect(volume?.lists).toBeGreaterThan(4_000);
      expect(timings).toHaveLength(statements.length);
      expect(total).toBeLessThan(60_000);
      for (const relation of ['tasks', 'lists', 'spaces']) {
        expect(
          locks.filter((lock) => lock.startsWith(`${relation} `)),
          relation,
        ).not.toEqual([]);
      }
      expect(leftover).toEqual({ relations: 0, columns: 0 });
    }, 300_000);
  });
});
