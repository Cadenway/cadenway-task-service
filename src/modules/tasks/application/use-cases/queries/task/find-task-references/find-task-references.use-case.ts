import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';
import type { FindTaskReferencesInput } from './find-task-references.input.js';
import type { FindTaskReferencesOutput } from './find-task-references.output.js';

/**
 * Constant MAX_TASK_IDS
 *
 * @description
 * How many ids one call reads at most: a page of the access requests of the caller.
 *
 * @type {number}
 */
const MAX_TASK_IDS: number = 100;

/**
 * Constant UUID
 *
 * @description
 * A UUID in its canonical text form, in either case: an id of another form names no task.
 *
 * @type {RegExp}
 */
const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Class FindTaskReferences
 *
 * @description
 * Public operation of the tasks module for the access-requests module: reads tasks by their ids,
 * each with its key, name and status as they are now and the list and space it is in, to show the
 * requests for access to tasks. It checks no visibility: the caller decides. Unknown ids, and ids
 * that are not UUIDs, are left out; the order is none in particular. It runs in
 * `TasksUnitOfWork.run`, which joins the tenant transaction of the caller, read-only or not,
 * scoped to the organization of the input: one statement by primary key for up to 100 ids, no
 * lock, nothing written and no event; no id reads nothing.
 */
export class FindTaskReferences {
  // #region Properties
  /** The tenant transaction of the use case. */
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
   * Reads the tasks named by the ids.
   *
   * @param {FindTaskReferencesInput} input - The organization and the ids, at most 100.
   * @returns {Promise<FindTaskReferencesOutput>} The tasks found.
   * @throws {Error} When more than 100 ids are asked for (a defect of the caller).
   */
  public async execute(input: FindTaskReferencesInput): Promise<FindTaskReferencesOutput> {
    if (input.taskIds.length > MAX_TASK_IDS) {
      throw new Error(
        `At most ${String(MAX_TASK_IDS)} tasks are read at once, ${String(input.taskIds.length)} were asked for.`,
      );
    }
    const taskIds: readonly string[] = input.taskIds.filter((id: string): boolean => UUID.test(id));
    if (taskIds.length === 0) {
      return { tasks: [] };
    }
    const tasks: readonly TaskLocation[] = await this.unitOfWork.run(
      (store: TasksStore): Promise<readonly TaskLocation[]> =>
        store.reader.locationsByIds(input.organizationId, taskIds),
    );
    return { tasks };
  }
  // #endregion
}
