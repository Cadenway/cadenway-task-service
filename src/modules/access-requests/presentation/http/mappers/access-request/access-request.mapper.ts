import type { AccessRequest as AccessRequestBody } from '@cadenway/contracts/types/internal/task-service';

import type { AccessRequestView } from '../../../../application/projections/access-request/access-request-view.projection.js';

/**
 * Function toAccessRequest
 *
 * @description
 * Maps a request to the `AccessRequest` of the contract: the requester as a `UserRef`, the status
 * as `state`, the instants as ISO 8601 texts in UTC, the task of a task request with its key, name
 * and status as they are now.
 *
 * @param {AccessRequestView} view - The request.
 * @returns {AccessRequestBody} The request of the contract.
 */
export function toAccessRequest(view: AccessRequestView): AccessRequestBody {
  return {
    id: view.id,
    target: view.target,
    spaceId: view.spaceId,
    listId: view.listId,
    task:
      view.task === null
        ? null
        : { key: view.task.key, name: view.task.name, status: view.task.status },
    requester: { userId: view.requesterUserId },
    message: view.message,
    state: view.status,
    role: view.role,
    createdAt: view.createdAt.toISOString(),
    decidedAt: view.decidedAt === null ? null : view.decidedAt.toISOString(),
    decidedBy:
      view.decidedBy === null ? null : { type: view.decidedBy.type, id: view.decidedBy.id },
  };
}
