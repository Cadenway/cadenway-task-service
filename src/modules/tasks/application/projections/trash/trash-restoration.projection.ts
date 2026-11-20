import type { PlacedList } from '../../models/placement/placed-list.model.js';
import type { TaskView } from '../task/task-view.projection.js';

/**
 * Interface TrashRestorationView
 *
 * @description
 * What a restoration from the trash brought back (`TrashRestored` of
 * `openapi/internal/task-service.yaml`: "CAD-452 restaurée", "Avec 2 sous-tâches, de retour dans
 * Sprint 14.").
 */
export interface TrashRestorationView {
  // #region Properties
  /** The root of the entry, back in its list, read again with its checklist. */
  readonly task: TaskView;

  /** The list it is back in, with the role of the actor. */
  readonly list: PlacedList;

  /** The subtasks that came back with it, at every level. */
  readonly subtaskCount: number;

  /** Whether the root left its parent (", détachée de son parent supprimé"). */
  readonly detached: boolean;

  /** Whether its list, deleted, came back with it, at the end of its space. */
  readonly listRestored: boolean;

  /** Whether the space of that list, deleted, came back too, at the end of the sidebar. */
  readonly spaceRestored: boolean;
  // #endregion
}
