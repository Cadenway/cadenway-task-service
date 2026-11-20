import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { ListUntrashedTaskIdsInput } from './list-untrashed-task-ids.input.js';
import type { ListUntrashedTaskIdsOutput } from './list-untrashed-task-ids.output.js';

/**
 * Constant MAX_TASK_IDS
 *
 * @description
 * How many ids one call reads, which bounds its statement; a caller with more (an entry holds 651
 * live tasks at most, plus archived subtasks the product does not limit) sends them in chunks of
 * this size at most, and more in one call is a defect of the caller.
 *
 * @type {number}
 */
const MAX_TASK_IDS: number = 2000;

/**
 * Constant UUID
 *
 * @description
 * The shape of a task id; any other text names no task.
 *
 * @type {RegExp}
 */
const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Class ListUntrashedTaskIds
 *
 * @description
 * Tells which of some tasks exist and are out of the trash, live or archived, so that the job that
 * drops the pending access requests of a trash entry (`task.drop-trashed-task-requests` of
 * deletion-lifecycle) keeps those of a task restored before it ran, and drops those of a task
 * still in the trash or erased since. A locking read: it joins the transaction of its caller
 * (`TasksUnitOfWork.run`, which must be able to lock) or opens its own, locks the tasks of the ids
 * `FOR SHARE` in one statement ordered by id (`TaskRepository.lockUntrashedIds`, in the trash or
 * not) and answers those out of the trash as read under the lock; it writes nothing. A restoration
 * locks its tasks `FOR NO KEY UPDATE` and an erasure `FOR UPDATE`, so either committed before and
 * is seen, or waits for the commit of the caller: the requests the caller drops in the same
 * transaction are those of tasks still in the trash or gone until it commits. Lock order: the
 * tasks, then the access requests the caller deletes. An id that is not a UUID names no task and
 * is left out rather than failing the cast.
 */
export class ListUntrashedTaskIds {
  // #region Properties
  /** The tenant transaction of the query. */
  private readonly unitOfWork: TasksUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: TasksUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Locks the tasks of the ids `FOR SHARE` and answers those out of the trash.
   *
   * @param {ListUntrashedTaskIdsInput} input - The organization and the ids.
   * @returns {Promise<ListUntrashedTaskIdsOutput>} Those that are tasks out of the trash, by id.
   * @throws {Error} With more than 2,000 ids, a defect of the caller, before any read.
   */
  public async execute(input: ListUntrashedTaskIdsInput): Promise<ListUntrashedTaskIdsOutput> {
    if (input.taskIds.length > MAX_TASK_IDS) {
      throw new Error(
        `At most ${String(MAX_TASK_IDS)} tasks are read at once, ${String(input.taskIds.length)} were asked for.`,
      );
    }
    const taskIds: readonly string[] = input.taskIds
      .filter((id: string): boolean => UUID.test(id))
      .map((id: string): string => id.toLowerCase());
    if (taskIds.length === 0) {
      return { taskIds: [] };
    }
    const untrashed: readonly string[] = await this.unitOfWork.run(
      (store: TasksStore): Promise<readonly string[]> =>
        store.tasks.lockUntrashedIds(input.organizationId, taskIds),
    );
    return { taskIds: untrashed };
  }
  // #endregion
}
