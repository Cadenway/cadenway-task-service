import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, getTableColumns, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { DependencyCandidatePosition } from '../../../../../application/models/dependency/dependency-candidate-position.model.js';
import type { DependencyCandidateQuery } from '../../../../../application/models/dependency/dependency-candidate-query.model.js';
import type { DependencyEdge } from '../../../../../application/models/dependency/dependency-edge.model.js';
import type { DependencyGraphCheck } from '../../../../../application/models/dependency/dependency-graph-check.model.js';
import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { TaskDependencyRepository } from '../../../../../application/ports/outbound/persistence/dependency/task-dependency-repository.port.js';
import type { DependencyCandidatePage } from '../../../../../application/projections/dependency/dependency-candidate-page.projection.js';
import type { DependencyPageView } from '../../../../../application/projections/dependency/dependency-page.projection.js';
import type { DependencyView } from '../../../../../application/projections/dependency/dependency.projection.js';
import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import { DEPENDENCY_LIMIT } from '../../../../../domain/policies/dependency/dependency-graph.policy.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { keysetAfter } from '../../mappers/page/keyset-after.mapper.js';
import type { RawTaskPageRow } from '../../mappers/query/raw-task-page-row.mapper.js';
import { searchCondition } from '../../mappers/query/task-filter.mapper.js';
import { taskPageColumns, toTaskSummaryRow } from '../../mappers/query/task-page-row.mapper.js';
import { liveTask } from '../../mappers/task/live-task.mapper.js';
import type { TaskRow } from '../../mappers/task/task.mapper.js';
import { taskDependencies } from '../../schemas/dependency/task-dependency.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { DrizzleTaskCollections } from '../task/task-collections.repository.js';

/** Joined endpoint tables for an edge page. */
const blockers = alias(tasks, 'dependency_blocker');
const blocked = alias(tasks, 'dependency_blocked');

/** The selected edge and both of its task rows. */
interface EdgeRow {
  // #region Properties
  /** The stored edge. */
  readonly edge: typeof taskDependencies.$inferSelect;

  /** The blocker task. */
  readonly blocker: TaskRow;

  /** The blocked task. */
  readonly blocked: TaskRow;
  // #endregion
}

/** One candidate row with the ordering rank. */
interface CandidateRow extends RawTaskPageRow {
  // #region Properties
  /** Zero for the anchor list and one for other lists. */
  readonly rank: number;
  // #endregion
}

/**
 * Tenant-scoped graph persistence. Writers serialize the graph by an advisory transaction lock
 * before taking task locks. Reads page in SQL and load task collections in bounded batches.
 */
export class DrizzleTaskDependencyRepository implements TaskDependencyRepository {
  // #region Properties
  /** Database bound to the caller's tenant transaction. */
  private readonly db: TransactionDatabase;

  /** Batch loader for the summaries returned by a page. */
  private readonly collections: DrizzleTaskCollections;
  // #endregion

  // #region Constructor
  /**
   * Binds the graph to a tenant transaction.
   *
   * @param {TransactionDatabase} db - The transaction database.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
    this.collections = new DrizzleTaskCollections(db);
  }
  // #endregion

  // #region Methods
  /**
   * Serializes graph changes within an organization until the transaction ends.
   *
   * @param {string} organizationId - The caller's organization.
   * @returns {Promise<void>} Resolves once the graph lock is held.
   */
  public async lockGraph(organizationId: string): Promise<void> {
    await this.db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`task-dependencies:${organizationId}`}, 0))`,
    );
  }

  /**
   * Reads an incident edge without revealing one belonging to another task or organization.
   *
   * @param {string} organizationId - The caller's organization.
   * @param {string} anchorId - The task addressed by the route.
   * @param {string} dependencyId - The dependency to find.
   * @returns {Promise<DependencyEdge | null>} The edge, or null.
   */
  public async findEdge(
    organizationId: string,
    anchorId: string,
    dependencyId: string,
  ): Promise<DependencyEdge | null> {
    const rows = await this.db
      .select()
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.organizationId, organizationId),
          eq(taskDependencies.id, dependencyId),
          or(
            eq(taskDependencies.blockerTaskId, anchorId),
            eq(taskDependencies.blockedTaskId, anchorId),
          ),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : this.edgeOf(row);
  }

  /**
   * Inspects all retained edges, including archived and trashed endpoints, under the graph lock.
   *
   * @param {string} organizationId - The caller's organization.
   * @param {string} blockerId - Proposed blocker task.
   * @param {string} blockedId - Proposed blocked task.
   * @returns {Promise<DependencyGraphCheck>} Duplicate, cycle and incident-limit decisions.
   */
  public async inspect(
    organizationId: string,
    blockerId: string,
    blockedId: string,
  ): Promise<DependencyGraphCheck> {
    const result = await this.db.execute<
      { duplicate: boolean; cycle: boolean; limitReached: boolean } & Record<string, unknown>
    >(sql`
      with recursive reachable(id) as (
        select ${blockedId}::uuid
        union
        select d.blocked_task_id from task_dependencies d
        join reachable r on r.id = d.blocker_task_id
        where d.organization_id = ${organizationId}::uuid
      )
      select exists (
        select 1 from task_dependencies d where d.organization_id = ${organizationId}::uuid
        and d.blocker_task_id = ${blockerId}::uuid and d.blocked_task_id = ${blockedId}::uuid
      ) as "duplicate",
      exists (select 1 from reachable where id = ${blockerId}::uuid) as "cycle",
      (select count(*) from task_dependencies d where d.organization_id = ${organizationId}::uuid
        and (d.blocker_task_id = ${blockerId}::uuid or d.blocked_task_id = ${blockerId}::uuid)) >= ${DEPENDENCY_LIMIT}
      or
      (select count(*) from task_dependencies d where d.organization_id = ${organizationId}::uuid
        and (d.blocker_task_id = ${blockedId}::uuid or d.blocked_task_id = ${blockedId}::uuid)) >= ${DEPENDENCY_LIMIT}
      as "limitReached"
    `);
    const resultRow = result.rows[0];
    if (resultRow === undefined) throw new Error('The graph inspection returned no row.');
    return resultRow;
  }

  /**
   * Inserts an edge after graph and endpoint checks.
   *
   * @param {string} organizationId - The caller's organization.
   * @param {string} blockerId - The blocker.
   * @param {string} blockedId - The blocked task.
   * @returns {Promise<DependencyEdge>} The persisted edge.
   */
  public async insert(
    organizationId: string,
    blockerId: string,
    blockedId: string,
  ): Promise<DependencyEdge> {
    const rows = await this.db
      .insert(taskDependencies)
      .values({
        organizationId,
        blockerTaskId: blockerId,
        blockedTaskId: blockedId,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) throw new Error('The dependency insert returned no row.');
    return this.edgeOf(row);
  }

  /**
   * Removes an already checked edge.
   *
   * @param {string} organizationId - The caller's organization.
   * @param {DependencyEdge} edge - The locked graph edge.
   * @returns {Promise<void>} Resolves once removed.
   */
  public async remove(organizationId: string, edge: DependencyEdge): Promise<void> {
    await this.db
      .delete(taskDependencies)
      .where(
        and(eq(taskDependencies.organizationId, organizationId), eq(taskDependencies.id, edge.id)),
      );
  }

  /**
   * Reads one visible edge with summaries of both endpoints.
   *
   * @param {string} organizationId - The caller's organization.
   * @param {string} anchorId - The addressed task.
   * @param {string} dependencyId - The dependency id.
   * @param {readonly string[]} visibleListIds - Lists visible to the actor.
   * @returns {Promise<DependencyView | null>} The edge when both endpoints are visible.
   */
  public async get(
    organizationId: string,
    anchorId: string,
    dependencyId: string,
    visibleListIds: readonly string[],
  ): Promise<DependencyView | null> {
    const rows = await this.edgeRows(
      organizationId,
      anchorId,
      visibleListIds,
      null,
      1,
      dependencyId,
    );
    return (await this.viewsOf(organizationId, rows))[0] ?? null;
  }

  /**
   * Reads an incident edge page, hiding invisible or inactive counterpart tasks.
   *
   * @param {string} organizationId - The caller's organization.
   * @param {string} anchorId - The addressed task.
   * @param {readonly string[]} visibleListIds - Lists visible to the actor.
   * @param {PagePosition | null} after - Previous edge position.
   * @param {number} limit - Maximum number of items.
   * @returns {Promise<DependencyPageView>} The visible page and next position.
   */
  public async page(
    organizationId: string,
    anchorId: string,
    visibleListIds: readonly string[],
    after: PagePosition | null,
    limit: number,
  ): Promise<DependencyPageView> {
    const rows = await this.edgeRows(organizationId, anchorId, visibleListIds, after, limit + 1);
    const selected = rows.slice(0, limit);
    const last = selected.at(-1);
    return {
      items: await this.viewsOf(organizationId, selected),
      next:
        rows.length > limit && last !== undefined
          ? { createdAt: last.edge.createdAt, id: last.edge.id }
          : null,
    };
  }

  /**
   * Finds editable, live candidates while excluding existing edges, full endpoints and cycles.
   *
   * @param {DependencyCandidateQuery} query - Actor-filtered lists and page criteria.
   * @returns {Promise<DependencyCandidatePage>} The page, next position and total.
   */
  public async candidates(query: DependencyCandidateQuery): Promise<DependencyCandidatePage> {
    if (query.editableListIds.length === 0) return { items: [], next: null, total: 0 };
    const rank = sql`case when ${tasks.listId} = ${query.anchorListId}::uuid then 0 else 1 end`;
    const traversalSource =
      query.direction === 'blocks' ? sql.raw('blocked_task_id') : sql.raw('blocker_task_id');
    const traversalTarget =
      query.direction === 'blocks' ? sql.raw('blocker_task_id') : sql.raw('blocked_task_id');
    const existingSource = query.direction === 'blocks' ? query.anchorId : tasks.id;
    const existingTarget = query.direction === 'blocks' ? tasks.id : query.anchorId;
    const graph = sql`with recursive reachable(id) as (
      select ${query.anchorId}::uuid
      union
      select d.${traversalTarget} from task_dependencies d join reachable r on d.${traversalSource} = r.id
      where d.organization_id = ${query.organizationId}::uuid
    )`;
    const eligible = sql`${tasks.organizationId} = ${query.organizationId}::uuid
      and ${anyOf(tasks.listId, query.editableListIds, 'uuid')} and ${liveTask()}
      and ${tasks.id} not in (select id from reachable)
      and not exists (select 1 from task_dependencies d where d.organization_id = ${query.organizationId}::uuid
        and d.blocker_task_id = ${existingSource} and d.blocked_task_id = ${existingTarget})
      and (select count(*) from task_dependencies d where d.organization_id = ${query.organizationId}::uuid
        and (d.blocker_task_id = ${query.anchorId}::uuid or d.blocked_task_id = ${query.anchorId}::uuid)) < ${DEPENDENCY_LIMIT}
      and (select count(*) from task_dependencies d where d.organization_id = ${query.organizationId}::uuid
        and (d.blocker_task_id = ${tasks.id} or d.blocked_task_id = ${tasks.id})) < ${DEPENDENCY_LIMIT}
      ${query.search === null ? sql`` : sql`and ${searchCondition(query.search)}`}`;
    const after =
      query.after === null
        ? sql``
        : sql`and (${rank}, ${tasks.name} collate "C", ${tasks.keyPrefix} collate "C", ${tasks.keyNumber}) >
      (${query.after.rank}, ${query.after.name}::text collate "C", ${query.after.keyPrefix}::text collate "C", ${query.after.keyNumber})`;
    const result = await this.db.execute<CandidateRow & Record<string, unknown>>(sql`${graph}
      select ${taskPageColumns()}, ${rank} as "rank", null as "sortValue" from ${tasks}
      where ${eligible} ${after}
      order by ${rank}, ${tasks.name} collate "C", ${tasks.keyPrefix} collate "C", ${tasks.keyNumber}
      limit ${query.limit + 1}`);
    const count = await this.db.execute<{ total: number } & Record<string, unknown>>(sql`${graph}
      select count(*)::int as "total" from ${tasks} where ${eligible}`);
    const rows = result.rows.slice(0, query.limit);
    const items = await this.collections.summarize(
      query.organizationId,
      rows.map(toTaskSummaryRow),
    );
    const last: CandidateRow | undefined = rows.at(-1);
    const next: DependencyCandidatePosition | null =
      result.rows.length > query.limit && last !== undefined
        ? { rank: last.rank, name: last.name, keyPrefix: last.keyPrefix, keyNumber: last.keyNumber }
        : null;
    return { items, next, total: count.rows[0]?.total ?? 0 };
  }

  /** Maps the database row to the application edge. */
  private edgeOf(row: typeof taskDependencies.$inferSelect): DependencyEdge {
    return {
      id: row.id,
      blockerId: row.blockerTaskId,
      blockedId: row.blockedTaskId,
      createdAt: row.createdAt,
    };
  }

  /** Reads visible incident edges and their endpoint rows in stable creation order. */
  private async edgeRows(
    organizationId: string,
    anchorId: string,
    visibleListIds: readonly string[],
    after: PagePosition | null,
    limit: number,
    dependencyId?: string,
  ): Promise<readonly EdgeRow[]> {
    if (visibleListIds.length === 0) return [];
    return this.db
      .select({
        edge: getTableColumns(taskDependencies),
        blocker: getTableColumns(blockers),
        blocked: getTableColumns(blocked),
      })
      .from(taskDependencies)
      .innerJoin(
        blockers,
        and(
          eq(blockers.organizationId, taskDependencies.organizationId),
          eq(blockers.id, taskDependencies.blockerTaskId),
        ),
      )
      .innerJoin(
        blocked,
        and(
          eq(blocked.organizationId, taskDependencies.organizationId),
          eq(blocked.id, taskDependencies.blockedTaskId),
        ),
      )
      .where(
        and(
          eq(taskDependencies.organizationId, organizationId),
          anyOf(blockers.listId, visibleListIds, 'uuid'),
          anyOf(blocked.listId, visibleListIds, 'uuid'),
          or(
            and(eq(blockers.id, anchorId), liveTask(blocked)),
            and(eq(blocked.id, anchorId), liveTask(blockers)),
          ),
          dependencyId === undefined ? undefined : eq(taskDependencies.id, dependencyId),
          keysetAfter(taskDependencies.createdAt, taskDependencies.id, after),
        ),
      )
      .orderBy(asc(taskDependencies.createdAt), asc(taskDependencies.id))
      .limit(limit);
  }

  /** Summarizes both endpoints in one collection load, keeping edge order. */
  private async viewsOf(
    organizationId: string,
    rows: readonly EdgeRow[],
  ): Promise<readonly DependencyView[]> {
    const summaries = await this.collections.summarize(
      organizationId,
      rows.flatMap((row) => [row.blocker, row.blocked]),
    );
    return rows.map((row, index) => {
      const blocker: TaskSummaryView | undefined = summaries[index * 2];
      const blockedTask: TaskSummaryView | undefined = summaries[index * 2 + 1];
      if (blocker === undefined || blockedTask === undefined)
        throw new Error('The dependency endpoints could not be summarized.');
      return { id: row.edge.id, blocker, blocked: blockedTask };
    });
  }
  // #endregion
}
