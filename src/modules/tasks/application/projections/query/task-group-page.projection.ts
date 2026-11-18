import type { GroupPosition } from '../../models/query/group-position.model.js';
import type { TaskGrouping } from '../../models/query/task-grouping.model.js';
import type { TaskGroupView } from './task-group.projection.js';

/**
 * Interface TaskGroupPage
 *
 * @description
 * One page of the groups of the tasks of a list.
 */
export interface TaskGroupPage {
  // #region Properties
  /** What the tasks are grouped by. */
  readonly grouping: TaskGrouping;

  /** The groups of the page. */
  readonly items: readonly TaskGroupView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: GroupPosition | null;

  /** How many tasks match the filters, each counted once. */
  readonly total: number;
  // #endregion
}
