import type { PlacedList } from '../../models/placement/placed-list.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';

/**
 * Class TaskEditGuard
 *
 * @description
 * Checks that the actor may change the tasks of a list they see: "Who has `edit` on the list
 * creates and changes its tasks; anyone else who sees it reads them and gets
 * `403 access.role-insufficient` for a change" ("Who sees a task" of `openapi/public/tasks.yaml`,
 * decision 2 of P3b-1). The role is the one the spaces module computed for the actor on the list
 * (`PlacedList.callerRole`); the visibility is checked before, so a list the actor does not see
 * never reaches it. It decides nothing else and reads nothing.
 */
export class TaskEditGuard {
  // #region Methods
  /**
   * Method requireEdit
   *
   * @description
   * Refuses a change on a list the actor has another role than `edit` on.
   *
   * @param {PlacedList} list - The list as the actor sees it, with their role.
   * @throws {TaskRefusal} `role-insufficient` with the role of the actor on the list.
   */
  public requireEdit(list: PlacedList): void {
    if (list.callerRole !== 'edit') {
      throw new TaskRefusal({ reason: 'role-insufficient', role: list.callerRole });
    }
  }
  // #endregion
}
