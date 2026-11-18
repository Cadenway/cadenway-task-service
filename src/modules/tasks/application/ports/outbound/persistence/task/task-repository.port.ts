import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { SubtreeShape } from '../../../../../domain/value-objects/subtask/subtree-shape.value-object.js';
import type { ChecklistItemDraft } from '../../../../../domain/value-objects/task/checklist-item-draft.value-object.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { TaskDraft } from '../../../../../domain/value-objects/task/task-draft.value-object.js';
import type { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';

/**
 * Interface TaskRepository
 *
 * @description
 * The tasks of the tenant transaction, each with its ordered assignees, labels and checklist. Every
 * method filters on the organization. Locks are `FOR NO KEY UPDATE` and last until the commit; the
 * order of the locks of a write is memberships, then tasks (in ascending id when several), then the
 * key counter of the space.
 */
export interface TaskRepository {
  // #region Methods
  /**
   * Method findByKey
   *
   * @description
   * Finds a task by its key, a stored member of the task that never changes.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {TaskKey} key - The key.
   * @param {boolean} lock - `true` to lock the row `FOR NO KEY UPDATE` and read it after the lock.
   * @returns {Promise<Task | null>} The task, or `null` when the organization has none.
   */
  findByKey(organizationId: string, key: TaskKey, lock: boolean): Promise<Task | null>;

  /**
   * Method lockByIds
   *
   * @description
   * Locks several tasks in one statement, `ORDER BY id FOR NO KEY UPDATE`, and reads them after the
   * lock. Ids the organization does not hold are left out.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the tasks.
   * @returns {Promise<readonly Task[]>} The tasks, in ascending id order.
   */
  lockByIds(organizationId: string, ids: readonly string[]): Promise<readonly Task[]>;

  /**
   * Method insert
   *
   * @description
   * Stores a new task under a key, at version 1 with an empty checklist, and its assignees and
   * labels in order. The database gives the id and the creation instant.
   *
   * @param {TaskDraft} draft - The task the domain created.
   * @param {TaskKey} key - The key allocated for it.
   * @returns {Promise<Task>} The stored task.
   */
  insert(draft: TaskDraft, key: TaskKey): Promise<Task>;

  /**
   * Method save
   *
   * @description
   * Writes the changes of a task the use case holds locked: the row, the assignees, the labels and
   * the ticks of the checklist, by comparing the two states. Items of the checklist that `after`
   * has and `before` lacks were stored by `insertChecklistItem`.
   *
   * @param {Task} before - The task as it was read.
   * @param {Task} after - The task after the change, its version being `before`'s plus one.
   * @returns {Promise<void>} Resolves once written.
   */
  save(before: Task, after: Task): Promise<void>;

  /**
   * Method insertChecklistItem
   *
   * @description
   * Stores a new item at the end of the checklist of a task; the database gives its id.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task, locked by the caller.
   * @param {ChecklistItemDraft} draft - The item the domain drafted.
   * @returns {Promise<ChecklistItemState>} The stored item.
   */
  insertChecklistItem(
    organizationId: string,
    taskId: string,
    draft: ChecklistItemDraft,
  ): Promise<ChecklistItemState>;

  /**
   * Method levelOf
   *
   * @description
   * Tells how deep a task is in its tree of subtasks.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<number>} 1 for a top-level task, 2 for its subtask, and so on.
   */
  levelOf(organizationId: string, taskId: string): Promise<number>;

  /**
   * Method subtreeOf
   *
   * @description
   * Reads the descendants of a task and the height of its tree.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<SubtreeShape>} Its descendants and the height (1 for a task without subtask).
   */
  subtreeOf(organizationId: string, taskId: string): Promise<SubtreeShape>;

  /**
   * Method childCount
   *
   * @description
   * Counts the direct subtasks of a task.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent, locked by the caller when the count guards a write.
   * @returns {Promise<number>} The count.
   */
  childCount(organizationId: string, parentId: string): Promise<number>;

  /**
   * Method lockAssignedTo
   *
   * @description
   * Locks a batch of the tasks an account is assigned to, closed ones included, in ascending id
   * order after a given id, and reads them after the lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {string | null} afterId - The last id of the previous batch, `null` for the first.
   * @param {number} limit - The size of the batch.
   * @returns {Promise<readonly Task[]>} The tasks; fewer than `limit` on the last batch.
   */
  lockAssignedTo(
    organizationId: string,
    userId: string,
    afterId: string | null,
    limit: number,
  ): Promise<readonly Task[]>;

  /**
   * Method unassignBatch
   *
   * @description
   * Removes an account from the assignees of the tasks of a batch and writes their new versions and
   * instants, in set-based statements (not one per task).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly Task[]} updated - The tasks locked by `lockAssignedTo`, after `unassign`.
   * @returns {Promise<void>} Resolves once written.
   */
  unassignBatch(organizationId: string, userId: string, updated: readonly Task[]): Promise<void>;
  // #endregion
}
