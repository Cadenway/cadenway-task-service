import type { TaskList } from '@cadenway/contracts/types/internal/task-service';

import type { GetListOutput } from '../../../../application/use-cases/queries/list/get-list/get-list.output.js';

/**
 * Function toTaskList
 *
 * @description
 * Maps a list of the use cases to the `TaskList` of `openapi/internal/task-service.yaml`: the
 * sprint with its two dates and its goal, `null` for a list that is not a sprint, and the creation
 * instant in ISO 8601. The organization of the list is not part of the contract and does not leave
 * the service.
 *
 * @param {GetListOutput} state - The list.
 * @returns {TaskList} The list of the contract.
 */
export function toTaskList(state: GetListOutput): TaskList {
  return {
    id: state.id,
    spaceId: state.spaceId,
    name: state.name,
    icon: state.icon,
    color: state.color,
    sprint:
      state.sprint === null
        ? null
        : {
            startDate: state.sprint.startDate,
            endDate: state.sprint.endDate,
            goal: state.sprint.goal,
          },
    createdAt: state.createdAt.toISOString(),
    version: state.version,
  };
}
