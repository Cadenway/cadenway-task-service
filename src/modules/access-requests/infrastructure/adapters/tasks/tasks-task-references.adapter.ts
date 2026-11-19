import type {
  FindTaskReference,
  TaskLocation,
} from '../../../../tasks/public/task/find-task-reference.js';
import type {
  FindTaskReferences,
  FindTaskReferencesOutput,
} from '../../../../tasks/public/task/find-task-references.js';
import type { TaskReference } from '../../../application/models/task/task-reference.model.js';
import type { TaskReferences } from '../../../application/ports/outbound/tasks/task/task-references.port.js';

/**
 * Function toReference
 *
 * @description
 * Copies a task the tasks module located into the model of this module.
 *
 * @param {TaskLocation} task - The task.
 * @returns {TaskReference} The same task.
 */
function toReference(task: TaskLocation): TaskReference {
  return {
    id: task.id,
    key: task.key,
    name: task.name,
    status: task.status,
    listId: task.listId,
    spaceId: task.spaceId,
  };
}

/**
 * Class TasksTaskReferences
 *
 * @description
 * `TaskReferences` on the public readings `FindTaskReference` (by key) and `FindTaskReferences`
 * (by ids, at most 100) of the tasks module, which locate a task whatever the member sees and join
 * the tenant transaction of the calling use case.
 */
export class TasksTaskReferences implements TaskReferences {
  // #region Properties
  /**
   * Property findTaskReference
   *
   * @description
   * The reading of a task by key.
   *
   * @type {FindTaskReference}
   * @readonly
   */
  private readonly findTaskReference: FindTaskReference;

  /**
   * Property findTaskReferences
   *
   * @description
   * The reading of tasks by ids.
   *
   * @type {FindTaskReferences}
   * @readonly
   */
  private readonly findTaskReferences: FindTaskReferences;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the two public readings of the tasks module.
   *
   * @param {FindTaskReference} findTaskReference - The reading by key.
   * @param {FindTaskReferences} findTaskReferences - The reading by ids.
   * @constructor
   */
  public constructor(findTaskReference: FindTaskReference, findTaskReferences: FindTaskReferences) {
    this.findTaskReference = findTaskReference;
    this.findTaskReferences = findTaskReferences;
  }
  // #endregion

  // #region Methods
  /**
   * Method findByKey
   *
   * @description
   * Runs `FindTaskReference` for the key.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskKey - The key.
   * @returns {Promise<TaskReference | null>} The task, or `null`.
   */
  public async findByKey(organizationId: string, taskKey: string): Promise<TaskReference | null> {
    const task: TaskLocation | null = await this.findTaskReference.execute({
      organizationId,
      taskKey,
    });
    return task === null ? null : toReference(task);
  }

  /**
   * Method findByIds
   *
   * @description
   * Runs `FindTaskReferences` for the ids, in one batch.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The ids, at most 100.
   * @returns {Promise<readonly TaskReference[]>} The tasks found.
   */
  public async findByIds(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<readonly TaskReference[]> {
    const found: FindTaskReferencesOutput = await this.findTaskReferences.execute({
      organizationId,
      taskIds,
    });
    return found.tasks.map(toReference);
  }
  // #endregion
}
