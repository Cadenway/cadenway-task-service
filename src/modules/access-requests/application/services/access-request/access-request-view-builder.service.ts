import type { AccessRequest } from '../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { AccessRequestState } from '../../../domain/value-objects/access-request/access-request-state.value-object.js';
import type { RequestPlacement } from '../../../domain/value-objects/access-request/request-placement.value-object.js';
import type { TaskReference } from '../../models/task/task-reference.model.js';
import type { AccessRequestView } from '../../projections/access-request/access-request-view.projection.js';

/**
 * Class AccessRequestViewBuilder
 *
 * @description
 * Builds what the people who manage a target read of a request (`AccessRequest` of
 * `openapi/internal/task-service.yaml`): the stored request, placed where its target is now (the
 * current list and space of the task of a task request), with its task as it is now.
 */
export class AccessRequestViewBuilder {
  // #region Methods
  /**
   * Method build
   *
   * @description
   * The view of one request.
   *
   * @param {AccessRequest} request - The request.
   * @param {RequestPlacement} placement - Where its target is now.
   * @param {TaskReference | null} task - The task of a task request as it is now, `null` otherwise.
   * @returns {AccessRequestView} The view.
   */
  public build(
    request: AccessRequest,
    placement: RequestPlacement,
    task: TaskReference | null,
  ): AccessRequestView {
    const state: AccessRequestState = request.snapshot;
    return {
      id: state.id,
      target: state.target,
      spaceId: placement.spaceId,
      listId: placement.listId,
      task: task === null ? null : { key: task.key, name: task.name, status: task.status },
      requesterUserId: state.requesterUserId,
      message: state.message,
      status: state.status,
      role: state.role,
      createdAt: state.createdAt,
      decidedAt: state.decidedAt,
      decidedBy: state.decidedBy,
    };
  }
  // #endregion
}
