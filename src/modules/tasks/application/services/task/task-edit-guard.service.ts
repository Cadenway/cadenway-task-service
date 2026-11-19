import { canWriteTasksOf } from '../../../domain/policies/task/task-write.policy.js';
import type { PlacedList } from '../../models/placement/placed-list.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';

/**
 * Class TaskEditGuard
 *
 * @description
 * Applies the task write policy of the domain (`canWriteTasksOf`, decision 2 of P3b-1) to a list
 * the actor sees, and turns its refusal into the one of the use cases (`role-insufficient`, which
 * the presentation answers `403 access.role-insufficient`). The role is the one the spaces module
 * computed for the actor on the list (`PlacedList.callerRole`); the visibility is checked before,
 * so a list the actor does not see never reaches it. It decides nothing itself and reads nothing.
 */
export class TaskEditGuard {
  // #region Methods
  /**
   * Method requireEdit
   *
   * @description
   * Refuses a change on a list whose role does not let the actor write its tasks.
   *
   * @param {PlacedList} list - The list as the actor sees it, with their role.
   * @throws {TaskRefusal} `role-insufficient` with the role of the actor on the list.
   */
  public requireEdit(list: PlacedList): void {
    if (!canWriteTasksOf(list.callerRole)) {
      throw new TaskRefusal({ reason: 'role-insufficient', role: list.callerRole });
    }
  }
  // #endregion
}
