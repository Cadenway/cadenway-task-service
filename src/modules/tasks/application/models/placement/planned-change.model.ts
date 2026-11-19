import type { TaskPatch } from '../../../domain/value-objects/task/task-patch.value-object.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';

/**
 * Interface PlannedChange
 *
 * @description
 * A patch resolved for the domain: the target list and parent looked up and checked, the statuses
 * of the space the task ends up in and the tasks that follow it.
 */
export interface PlannedChange {
  // #region Properties
  /** The patch the domain takes. */
  readonly patch: TaskPatch;

  /** The statuses of the space the task is in after the patch: the new parent, else the new list, else the current one. */
  readonly statuses: SpaceStatusUse;

  /** The locked live descendants of the task; empty when the task does not change list. */
  readonly descendants: readonly Task[];
  // #endregion
}
