import type { TaskPosition } from '../../../../models/query/task-position.model.js';
import type { MyTaskState } from '../../../../models/user/my-task-state.model.js';

/**
 * Interface ListMyTasksInput
 *
 * @description
 * A page of the tasks assigned to the actor.
 */
export interface ListMyTasksInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The `userId` of the path, which must be the actor. */
  readonly userId: string;

  /** The tab: `open` or `closed`. */
  readonly state: MyTaskState;

  /** The last task of the previous page, `null` for the first page. */
  readonly after: TaskPosition | null;

  /** The size of the page, 1 to 100. */
  readonly limit: number;
  // #endregion
}
