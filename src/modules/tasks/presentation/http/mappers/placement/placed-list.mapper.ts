import type { TaskList } from '@cadenway/contracts/types/internal/task-service';

import type { PlacedList } from '../../../../application/models/placement/placed-list.model.js';

/**
 * Function toPlacedList
 *
 * @description
 * Maps the list of a task, as the spaces module showed it to the viewer, to the `TaskList` of
 * `openapi/internal/task-service.yaml`: the sprint with its two dates and its goal, `null` for a
 * list that is not a sprint, the creation instant in ISO 8601, the switch "Accès de
 * l’organisation" and the role of the viewer on the list (`callerRole`).
 *
 * @param {PlacedList} list - The list.
 * @returns {TaskList} The list of the contract.
 */
export function toPlacedList(list: PlacedList): TaskList {
  return {
    id: list.id,
    spaceId: list.spaceId,
    name: list.name,
    icon: list.icon,
    color: list.color,
    sprint:
      list.sprint === null
        ? null
        : {
            startDate: list.sprint.startDate,
            endDate: list.sprint.endDate,
            goal: list.sprint.goal,
          },
    createdAt: list.createdAt.toISOString(),
    version: list.version,
    organizationAccess: list.organizationAccess,
    callerRole: list.callerRole,
  };
}
