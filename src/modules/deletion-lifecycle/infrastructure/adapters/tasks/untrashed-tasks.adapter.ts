import type {
  ListUntrashedTaskIds,
  ListUntrashedTaskIdsOutput,
} from '../../../../tasks/public/trash/list-untrashed-task-ids.js';
import type { UntrashedTasks } from '../../../application/ports/outbound/tasks/trash/untrashed-tasks.port.js';

/**
 * Constant TASKS_PER_CALL
 *
 * @description
 * The most tasks one call of `ListUntrashedTaskIds` takes, its bound: a larger set is read in
 * chunks of this size, all in the transaction of the caller.
 *
 * @type {number}
 */
const TASKS_PER_CALL: number = 2_000;

/**
 * Class TasksUntrashedTasks
 *
 * @description
 * `UntrashedTasks` on the public operation `ListUntrashedTaskIds` of the tasks module, which joins
 * the tenant transaction of the job that calls it and locks the tasks it reads `FOR SHARE` until
 * its commit. The tasks are given to it 2,000 at a time, its bound, so the job passes any number of
 * them (an entry holds the archived subtasks of its root, which the product does not limit).
 */
export class TasksUntrashedTasks implements UntrashedTasks {
  // #region Properties
  /**
   * Property listUntrashedTaskIds
   *
   * @description
   * The read of the tasks out of the trash.
   *
   * @type {ListUntrashedTaskIds}
   * @readonly
   */
  private readonly listUntrashedTaskIds: ListUntrashedTaskIds;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the tasks module.
   *
   * @param {ListUntrashedTaskIds} listUntrashedTaskIds - The read of the tasks out of the trash.
   * @constructor
   */
  public constructor(listUntrashedTaskIds: ListUntrashedTaskIds) {
    this.listUntrashedTaskIds = listUntrashedTaskIds;
  }
  // #endregion

  // #region Methods
  /**
   * Method untrashedOf
   *
   * @description
   * Runs `ListUntrashedTaskIds` once per chunk of 2,000 tasks, none for no task.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {readonly string[]} taskIds - The tasks, any number.
   * @returns {Promise<readonly string[]>} Those out of the trash.
   */
  public async untrashedOf(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<readonly string[]> {
    const untrashed: string[] = [];
    for (let start: number = 0; start < taskIds.length; start += TASKS_PER_CALL) {
      const output: ListUntrashedTaskIdsOutput = await this.listUntrashedTaskIds.execute({
        organizationId,
        taskIds: taskIds.slice(start, start + TASKS_PER_CALL),
      });
      untrashed.push(...output.taskIds);
    }
    return untrashed;
  }
  // #endregion
}
