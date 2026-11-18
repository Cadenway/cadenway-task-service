import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq } from 'drizzle-orm';

import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { toChecklistItem } from '../../mappers/task/checklist-item.mapper.js';
import type { ChecklistItemRow } from '../../mappers/task/checklist-item.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';
import type { TaskRow } from '../../mappers/task/task.mapper.js';
import { checklistItems } from '../../schemas/checklist/checklist-item.schema.js';
import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { taskLabels } from '../../schemas/task/task-label.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';

/**
 * Class DrizzleTaskCollections
 *
 * @description
 * Loads what hangs off a set of task rows, one query per collection whatever the number of tasks:
 * the assignees and the labels in their order, the checklists in their order, and the keys of the
 * parents. Every query names `organization_id` and filters the tasks with one `= ANY($ids)`
 * parameter; each is served by the prefix `(organization_id, task_id)` of the primary key of its
 * table, or by the primary key of `tasks`. The task repository and the reader share it, so a page
 * of N tasks costs the same number of queries as one task.
 */
export class DrizzleTaskCollections {
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
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the loader to a transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /**
   * Method assigneesOf
   *
   * @description
   * Reads the assignees of tasks in one query, in the order of assignment.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, readonly string[]>>} The accounts by task id; a task
   * without assignee is left out.
   */
  public async assigneesOf(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const grouped = new Map<string, string[]>();
    if (taskIds.length === 0) {
      return grouped;
    }
    const rows: { taskId: string; userId: string }[] = await this.db
      .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(
        and(
          eq(taskAssignees.organizationId, organizationId),
          anyOf(taskAssignees.taskId, taskIds, 'uuid'),
        ),
      )
      .orderBy(asc(taskAssignees.position), asc(taskAssignees.userId));
    for (const row of rows) {
      grouped.set(row.taskId, [...(grouped.get(row.taskId) ?? []), row.userId]);
    }
    return grouped;
  }

  /**
   * Method labelsOf
   *
   * @description
   * Reads the labels of tasks in one query, in the order of addition, in their first spelling.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, readonly string[]>>} The labels by task id; a task
   * without label is left out.
   */
  public async labelsOf(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const grouped = new Map<string, string[]>();
    if (taskIds.length === 0) {
      return grouped;
    }
    const rows: { taskId: string; name: string }[] = await this.db
      .select({ taskId: taskLabels.taskId, name: taskLabels.name })
      .from(taskLabels)
      .where(
        and(
          eq(taskLabels.organizationId, organizationId),
          anyOf(taskLabels.taskId, taskIds, 'uuid'),
        ),
      )
      .orderBy(asc(taskLabels.position), asc(taskLabels.labelKey));
    for (const row of rows) {
      grouped.set(row.taskId, [...(grouped.get(row.taskId) ?? []), row.name]);
    }
    return grouped;
  }

  /**
   * Method checklistsOf
   *
   * @description
   * Reads the checklists of tasks in one query, in the order of addition.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, readonly ChecklistItemState[]>>} The items by task id; a
   * task without item is left out.
   */
  public async checklistsOf(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly ChecklistItemState[]>> {
    const grouped = new Map<string, ChecklistItemState[]>();
    if (taskIds.length === 0) {
      return grouped;
    }
    const rows: ChecklistItemRow[] = await this.db
      .select()
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.organizationId, organizationId),
          anyOf(checklistItems.taskId, taskIds, 'uuid'),
        ),
      )
      .orderBy(asc(checklistItems.taskId), asc(checklistItems.position));
    for (const row of rows) {
      grouped.set(row.taskId, [...(grouped.get(row.taskId) ?? []), toChecklistItem(row)]);
    }
    return grouped;
  }

  /**
   * Method keysOf
   *
   * @description
   * Reads the keys of tasks (the parents of a set of rows) in one query by primary key.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, TaskKey>>} The keys by task id.
   * @throws {InvalidTaskError} When a stored key is not a key.
   */
  public async keysOf(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskKey>> {
    const keys = new Map<string, TaskKey>();
    if (taskIds.length === 0) {
      return keys;
    }
    const rows: { id: string; keyPrefix: string; keyNumber: number }[] = await this.db
      .select({ id: tasks.id, keyPrefix: tasks.keyPrefix, keyNumber: tasks.keyNumber })
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), anyOf(tasks.id, taskIds, 'uuid')));
    for (const row of rows) {
      keys.set(row.id, TaskKey.of(row.keyPrefix, row.keyNumber));
    }
    return keys;
  }

  /**
   * Method assemble
   *
   * @description
   * Turns task rows into tasks: the assignees, labels, checklists and parent keys of all of them
   * are loaded in four queries, after the rows were read (and locked, when the caller asked), so a
   * task is the committed state at that instant. The tasks keep the order of the rows. With
   * `withChecklists` false the checklist query is skipped and every task carries an empty
   * checklist: only for a caller that never reads it (the unassignment of a removed member).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly TaskRow[]} rows - The rows.
   * @param {boolean} [withChecklists] - `false` to leave the checklists unloaded; `true` by default.
   * @returns {Promise<readonly Task[]>} The tasks.
   * @throws {Error} When a stored value is outside its set, or a parent is missing.
   * @throws {InvalidTaskError} When a stored state breaks an invariant of the domain.
   */
  public async assemble(
    organizationId: string,
    rows: readonly TaskRow[],
    withChecklists: boolean = true,
  ): Promise<readonly Task[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids: string[] = rows.map((row: TaskRow): string => row.id);
    const parentIds: string[] = [
      ...new Set(
        rows
          .map((row: TaskRow): string | null => row.parentId)
          .filter((parentId: string | null): parentId is string => parentId !== null),
      ),
    ];
    const assignees: ReadonlyMap<string, readonly string[]> = await this.assigneesOf(
      organizationId,
      ids,
    );
    const labels: ReadonlyMap<string, readonly string[]> = await this.labelsOf(organizationId, ids);
    const checklists: ReadonlyMap<string, readonly ChecklistItemState[]> = withChecklists
      ? await this.checklistsOf(organizationId, ids)
      : new Map<string, readonly ChecklistItemState[]>();
    const parentKeys: ReadonlyMap<string, TaskKey> = await this.keysOf(organizationId, parentIds);
    return rows.map((row: TaskRow): Task => {
      let parentKey: TaskKey | null = null;
      if (row.parentId !== null) {
        parentKey = parentKeys.get(row.parentId) ?? null;
        if (parentKey === null) {
          throw new Error(`The parent ${row.parentId} of the stored task ${row.id} is missing.`);
        }
      }
      return toTask(
        row,
        parentKey,
        assignees.get(row.id) ?? [],
        labels.get(row.id) ?? [],
        checklists.get(row.id) ?? [],
      );
    });
  }
  // #endregion
}
