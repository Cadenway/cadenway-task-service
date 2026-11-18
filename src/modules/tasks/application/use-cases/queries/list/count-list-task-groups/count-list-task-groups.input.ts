import type { GroupPosition } from '../../../../models/query/group-position.model.js';
import type { TaskFilterInput } from '../../../../models/query/task-filter-input.model.js';
import type { TaskGrouping } from '../../../../models/query/task-grouping.model.js';

/**
 * Interface CountListTaskGroupsInput
 *
 * @description
 * A page of the groups of the tasks of a list, with the filters of the tasks route.
 */
export interface CountListTaskGroupsInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token; `me` of the assignee filter. */
  readonly actorUserId: string;

  /** The list. */
  readonly listId: string;

  /** What the tasks are counted by. */
  readonly grouping: TaskGrouping;

  /** The filters, as the route carries them. */
  readonly filter: TaskFilterInput;

  /** The last group of the previous page, `null` for the first page. */
  readonly after: GroupPosition | null;

  /** The size of the page, 1 to 100. */
  readonly limit: number;
  // #endregion
}
