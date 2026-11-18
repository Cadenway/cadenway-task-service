import type { TaskFilterInput } from '../../../../models/query/task-filter-input.model.js';
import type { TaskOrder } from '../../../../models/query/task-order.model.js';
import type { TaskPosition } from '../../../../models/query/task-position.model.js';

/**
 * Interface ListListTasksInput
 *
 * @description
 * A page of the tasks of a list, filtered and sorted.
 */
export interface ListListTasksInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token; `me` of the assignee filter. */
  readonly actorUserId: string;

  /** The list. */
  readonly listId: string;

  /** The filters, as the route carries them. */
  readonly filter: TaskFilterInput;

  /** The order of the page. */
  readonly order: TaskOrder;

  /** The last task of the previous page, `null` for the first page. */
  readonly after: TaskPosition | null;

  /** The size of the page, 1 to 100. */
  readonly limit: number;
  // #endregion
}
