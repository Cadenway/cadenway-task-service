import type { TaskList } from '@cadenway/contracts/types/internal/task-service';

import type { ListView } from '../../../../application/projections/list/list-view.projection.js';

/**
 * Function toTaskList
 *
 * @description
 * Maps a list of the use cases to the `TaskList` of `openapi/internal/task-service.yaml`: the
 * sprint with its two dates and its goal, `null` for a list that is not a sprint, the creation
 * instant in ISO 8601, the switch "Accès de l’organisation" and the role of the caller. The
 * organization of the list is not part of the contract and does not leave the service.
 *
 * @param {ListView} view - The list and the role of the caller.
 * @returns {TaskList} The list of the contract.
 */
export function toTaskList(view: ListView): TaskList {
  const { list } = view;
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
    callerRole: view.callerRole,
  };
}
