import type { AccessCheck } from '@cadenway/contracts/types/internal/task-service';

import type { CheckTaskAccessOutput } from '../../../../application/use-cases/queries/task/check-task-access/check-task-access.output.js';

/**
 * Function toAccessCheck
 *
 * @description
 * Maps the access of the actor to a task to the `AccessCheck` of
 * `openapi/internal/task-service.yaml`: the role of the actor on the list of the task, the space,
 * the list, the stable id and the key of the task.
 *
 * @param {CheckTaskAccessOutput} access - The access.
 * @returns {AccessCheck} The body of the contract.
 */
export function toAccessCheck(access: CheckTaskAccessOutput): AccessCheck {
  return {
    role: access.role,
    spaceId: access.spaceId,
    listId: access.listId,
    taskId: access.taskId,
    taskKey: access.taskKey,
  };
}
