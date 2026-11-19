import type { TrashRestored } from '@cadenway/contracts/types/internal/task-service';

import type { TrashRestorationView } from '../../../../application/projections/trash/trash-restoration.projection.js';
import { toPlacedList } from '../placement/placed-list.mapper.js';
import { toTask } from '../task/task.mapper.js';

/**
 * Function toTrashRestored
 *
 * @description
 * Maps what a restoration brought back to `TrashRestored` of the contract: the root as `Task`, its
 * list as `TaskList` with the role of the actor, and what came back with it.
 *
 * @param {TrashRestorationView} view - The restoration.
 * @returns {TrashRestored} The body.
 */
export function toTrashRestored(view: TrashRestorationView): TrashRestored {
  return {
    task: toTask(view.task),
    list: toPlacedList(view.list),
    subtaskCount: view.subtaskCount,
    detached: view.detached,
    listRestored: view.listRestored,
    spaceRestored: view.spaceRestored,
  };
}
