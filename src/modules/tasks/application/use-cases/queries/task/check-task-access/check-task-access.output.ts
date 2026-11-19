import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface CheckTaskAccessOutput
 *
 * @description
 * What the realtime gateway needs to let a socket join the room of a task (`AccessCheck`): the role
 * of the actor on the list of the task and where the task is.
 */
export interface CheckTaskAccessOutput {
  // #region Properties
  /** The role of the actor on the list of the task. */
  readonly role: AccessRole;

  /** The space of the list of the task. */
  readonly spaceId: string;

  /** The list of the task. */
  readonly listId: string;

  /** The key of the task, as `CAD-482`. */
  readonly taskKey: string;
  // #endregion
}
