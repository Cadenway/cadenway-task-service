import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';
import type { FindTaskReferenceInput } from './find-task-reference.input.js';
import type { FindTaskReferenceOutput } from './find-task-reference.output.js';

/**
 * Class FindTaskReference
 *
 * @description
 * Public operation of the tasks module for the access-requests module: finds a task by its key,
 * with its id, name and status as they are now and the list and space it is in, so that a request
 * for access to a task can be addressed to its list. It checks no visibility: the caller decides
 * what the actor may learn of the task. A key that is not a key (`^[A-Z]{2,5}-[1-9][0-9]{0,8}$`)
 * and a key the organization holds no task under both answer `null`. It runs in
 * `TasksUnitOfWork.run`, which joins the tenant transaction of the caller, read-only or not,
 * scoped to the organization of the input: one statement by `tasks_key_unique`, no lock, nothing
 * written and no event.
 */
export class FindTaskReference {
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
   * Reads the task named by the key.
   *
   * @param {FindTaskReferenceInput} input - The organization and the key.
   * @returns {Promise<FindTaskReferenceOutput>} The task, or `null` when the key names none.
   */
  public async execute(input: FindTaskReferenceInput): Promise<FindTaskReferenceOutput> {
    let key: TaskKey;
    try {
      key = TaskKey.parse(input.taskKey);
    } catch (error: unknown) {
      if (error instanceof InvalidTaskError) {
        return null;
      }
      throw error;
    }
    return this.unitOfWork.run((store: TasksStore): Promise<TaskLocation | null> =>
      store.reader.locationByKey(input.organizationId, key),
    );
  }
  // #endregion
}
