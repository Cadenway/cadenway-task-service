import type { GoalLinkedMilestone } from '../../../../models/goal/goal-linked-milestone.model.js';
import type { GoalListCount } from '../../../../models/goal/goal-list-count.model.js';

/** Reads target data within the caller's tenant transaction. */
export interface GoalTargetReader {
  // #region Methods
  /** Finds only non-trashed milestones by stable key, including archived milestones.
   * When locking, acquire task row locks in ascending task ID order before returning their
   * current placement and status. A concurrent move or purge must finish before the read. */
  milestones(
    organizationId: string,
    keys: readonly string[],
    lock: boolean,
  ): Promise<readonly GoalLinkedMilestone[]>;

  /** Counts eligible live, non-cancelled ordinary root tasks in the given authorized lists.
   * Omit empty lists. Every query must filter on organizationId. */
  listCounts(
    organizationId: string,
    listIds: readonly string[],
  ): Promise<ReadonlyMap<string, GoalListCount>>;
  // #endregion
}
