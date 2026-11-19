import type { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { SubtaskCounts } from '../../../../projections/task/subtask-counts.projection.js';
import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';
import type { TaskReferenceInListView } from '../../../../projections/task/task-reference-in-list.projection.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';

/**
 * Interface TaskReader
 *
 * @description
 * The read side of the tasks: projections computed in batches (one query per collection for any
 * number of tasks, never one per task), without a lock. Every method filters on the organization.
 */
export interface TaskReader {
  // #region Methods
  /**
   * Method subtaskCounts
   *
   * @description
   * Counts the direct subtasks of tasks and the closed ones (`done`, `cancelled`). The subtasks of
   * a task are those of its archive (the one rule of the subtask reads, "Tasks" of
   * `openapi/public/archives.yaml`): the live ones for a live task, the ones archived with it for
   * an archived task; a subtask archived before keeps its own archive and is never counted.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, SubtaskCounts>>} The counts by task id; a task without
   * subtask may be left out.
   */
  subtaskCounts(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubtaskCounts>>;

  /**
   * Method childrenOf
   *
   * @description
   * Reads a page of the direct subtasks of a task of its archive (see `subtaskCounts`), in the
   * order of their creation with the id as tie-breaker, with their assignees, labels and counts.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @param {PagePosition | null} after - The last row of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly TaskSummaryView[]>} The rows.
   */
  childrenOf(
    organizationId: string,
    parentId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<readonly TaskSummaryView[]>;

  /**
   * Method countChildren
   *
   * @description
   * Counts the direct subtasks of a task of its archive (see `subtaskCounts`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @returns {Promise<number>} The count.
   */
  countChildren(organizationId: string, parentId: string): Promise<number>;

  /**
   * Method references
   *
   * @description
   * Reads the key, the name, the status and the list, as they are now, of tasks: the list tells
   * whether a task shows one of them as its parent (`showsParent`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, TaskReferenceInListView>>} The references by task id.
   */
  references(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskReferenceInListView>>;

  /**
   * Method locationByKey
   *
   * @description
   * Reads the id, the key, the name, the status, the list and the space of a task by its key, as
   * they are now, without its collections.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {TaskKey} key - The key.
   * @returns {Promise<TaskLocation | null>} The task, or `null` when the organization has none.
   */
  locationByKey(organizationId: string, key: TaskKey): Promise<TaskLocation | null>;

  /**
   * Method locationsByIds
   *
   * @description
   * Reads the id, the key, the name, the status, the list and the space of tasks by their ids, as
   * they are now, without their collections, in one statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The ids of the tasks.
   * @returns {Promise<readonly TaskLocation[]>} The tasks found, in no particular order; unknown
   * ids are left out.
   */
  locationsByIds(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<readonly TaskLocation[]>;
  // #endregion
}
