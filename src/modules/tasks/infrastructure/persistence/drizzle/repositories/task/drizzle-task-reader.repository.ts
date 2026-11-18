import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';

import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { ChecklistCounts } from '../../../../../application/projections/task/checklist-counts.projection.js';
import type { SubtaskCounts } from '../../../../../application/projections/task/subtask-counts.projection.js';
import type { TaskReferenceView } from '../../../../../application/projections/task/task-reference.projection.js';
import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import type { TaskReader } from '../../../../../application/ports/outbound/persistence/task/task-reader.port.js';
import { keysetAfter } from '../../mappers/page/keyset-after.mapper.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { toTaskReference, toTaskSummary } from '../../mappers/task/task-summary.mapper.js';
import type { TaskRow } from '../../mappers/task/task.mapper.js';
import { checklistItems } from '../../schemas/checklist/checklist-item.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { DrizzleTaskCollections } from './task-collections.repository.js';

/**
 * Class DrizzleTaskReader
 *
 * @description
 * `TaskReader` on `tasks`, `task_assignees`, `task_labels` and `checklist_items`, in the
 * transaction of its unit of work, without a lock. Every query names `organization_id`. The counts
 * and the references are one grouped or `= ANY($ids)` query for any number of tasks; a page of
 * subtasks costs six queries however many rows it holds: the parent key, the page (served by
 * `tasks_parent_created_index`, bounded by the `limit` of the caller), then the assignees, the
 * labels, the subtask counts and the checklist counts of its rows.
 */
export class DrizzleTaskReader implements TaskReader {
  // #region Properties
  /**
   * Property db
   *
   * @description
   * The Drizzle database of the transaction.
   *
   * @type {TransactionDatabase}
   * @readonly
   */
  private readonly db: TransactionDatabase;

  /**
   * Property collections
   *
   * @description
   * The loader of the assignees, labels and keys of task rows.
   *
   * @type {DrizzleTaskCollections}
   * @readonly
   */
  private readonly collections: DrizzleTaskCollections;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the reader to a transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
    this.collections = new DrizzleTaskCollections(db);
  }
  // #endregion

  // #region Methods
  /**
   * Method subtaskCounts
   *
   * @description
   * Counts the direct subtasks of tasks, and the closed ones, in one grouped query through
   * `tasks_parent_created_index`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, SubtaskCounts>>} The counts by task id; a task without
   * subtask is left out.
   */
  public async subtaskCounts(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubtaskCounts>> {
    const counts = new Map<string, SubtaskCounts>();
    if (taskIds.length === 0) {
      return counts;
    }
    const rows: { parentId: string | null; total: number; closed: number }[] = await this.db
      .select({
        parentId: tasks.parentId,
        total: sql<number>`count(*)::int`,
        closed: sql<number>`(count(*) filter (where ${tasks.status} in ('done', 'cancelled')))::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          isNotNull(tasks.parentId),
          anyOf(tasks.parentId, taskIds, 'uuid'),
        ),
      )
      .groupBy(tasks.parentId);
    for (const row of rows) {
      if (row.parentId !== null) {
        counts.set(row.parentId, { total: row.total, closed: row.closed });
      }
    }
    return counts;
  }

  /**
   * Method childrenOf
   *
   * @description
   * Reads a page of the direct subtasks of a task in the order `(created_at, id)`, after
   * `after`, with their assignees, labels, subtask counts and checklist counts, each loaded for
   * the whole page in one query.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @param {PagePosition | null} after - The last row of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly TaskSummaryView[]>} The rows.
   * @throws {Error} When the parent is unknown or a stored value is outside its set.
   */
  public async childrenOf(
    organizationId: string,
    parentId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<readonly TaskSummaryView[]> {
    const parentKeys = await this.collections.keysOf(organizationId, [parentId]);
    const parentKey = parentKeys.get(parentId);
    if (parentKey === undefined) {
      return [];
    }
    const rows: TaskRow[] = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.parentId, parentId),
          keysetAfter(tasks.createdAt, tasks.id, after),
        ),
      )
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(limit);
    if (rows.length === 0) {
      return [];
    }
    const ids: string[] = rows.map((row: TaskRow): string => row.id);
    const assignees = await this.collections.assigneesOf(organizationId, ids);
    const labels = await this.collections.labelsOf(organizationId, ids);
    const subtasks = await this.subtaskCounts(organizationId, ids);
    const checklists = await this.checklistCounts(organizationId, ids);
    const parentKeyText: string = parentKey.format();
    return rows.map((row: TaskRow): TaskSummaryView =>
      toTaskSummary(
        row,
        parentKeyText,
        assignees.get(row.id) ?? [],
        labels.get(row.id) ?? [],
        subtasks.get(row.id) ?? { total: 0, closed: 0 },
        checklists.get(row.id) ?? { total: 0, done: 0 },
      ),
    );
  }

  /**
   * Method countChildren
   *
   * @description
   * Counts the direct subtasks of a task through `tasks_parent_created_index`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @returns {Promise<number>} The count.
   */
  public async countChildren(organizationId: string, parentId: string): Promise<number> {
    const rows: { total: number }[] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.parentId, parentId)));
    return rows[0]?.total ?? 0;
  }

  /**
   * Method references
   *
   * @description
   * Reads the key, the name and the status of tasks in one query by primary key.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, TaskReferenceView>>} The references by task id.
   * @throws {Error} When a stored status is outside the status keys.
   */
  public async references(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskReferenceView>> {
    const references = new Map<string, TaskReferenceView>();
    if (taskIds.length === 0) {
      return references;
    }
    const rows: Pick<TaskRow, 'id' | 'keyPrefix' | 'keyNumber' | 'name' | 'status'>[] =
      await this.db
        .select({
          id: tasks.id,
          keyPrefix: tasks.keyPrefix,
          keyNumber: tasks.keyNumber,
          name: tasks.name,
          status: tasks.status,
        })
        .from(tasks)
        .where(and(eq(tasks.organizationId, organizationId), anyOf(tasks.id, taskIds, 'uuid')));
    for (const row of rows) {
      references.set(row.id, toTaskReference(row));
    }
    return references;
  }

  /**
   * Method checklistCounts
   *
   * @description
   * Counts the items of the checklists of tasks, and the ticked ones, in one grouped query through
   * the unique constraint on `(organization_id, task_id, position)`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, ChecklistCounts>>} The counts by task id; a task
   * without item is left out.
   */
  private async checklistCounts(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, ChecklistCounts>> {
    const counts = new Map<string, ChecklistCounts>();
    const rows: { taskId: string; total: number; done: number }[] = await this.db
      .select({
        taskId: checklistItems.taskId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`(count(*) filter (where ${checklistItems.done}))::int`,
      })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.organizationId, organizationId),
          anyOf(checklistItems.taskId, taskIds, 'uuid'),
        ),
      )
      .groupBy(checklistItems.taskId);
    for (const row of rows) {
      counts.set(row.taskId, { total: row.total, done: row.done });
    }
    return counts;
  }
  // #endregion
}
