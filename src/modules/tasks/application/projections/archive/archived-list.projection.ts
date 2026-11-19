import type { PlacedList } from '../../models/placement/placed-list.model.js';

/**
 * Interface ArchivedListView
 *
 * @description
 * A list of the archives ("Archives", tab "Listes"; `ArchivedList` of
 * `openapi/internal/task-service.yaml`): the list with its archive and the role of the actor, and
 * the number of its live top-level tasks ("14 tâches").
 */
export interface ArchivedListView {
  // #region Properties
  /** The list. */
  readonly list: PlacedList;

  /** Its live top-level tasks, subtasks and archived tasks left out. */
  readonly taskCount: number;
  // #endregion
}
