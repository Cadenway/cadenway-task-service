import type { AccessRequest } from '../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { AccessRequestState } from '../../../domain/value-objects/access-request/access-request-state.value-object.js';
import type { TaskReference } from '../../models/task/task-reference.model.js';
import type { AccessRequestView } from '../../projections/access-request/access-request-view.projection.js';

/**
 * Class AccessRequestViewBuilder
 *
 * @description
 * Builds what the people who manage a target read of a request (`AccessRequest` of
 * `openapi/internal/task-service.yaml`): the stored request, and for a task request its task as it
 * is now, read from the tasks module by the caller.
 */
export class AccessRequestViewBuilder {
  // #region Methods
  /**
   * Method taskIdsOf
   *
   * @description
   * The distinct tasks of the task requests among some requests, to read in one batch.
   *
   * @param {readonly AccessRequest[]} requests - The requests of a page.
   * @returns {readonly string[]} The ids of their tasks.
   */
  public taskIdsOf(requests: readonly AccessRequest[]): readonly string[] {
    const ids: Set<string> = new Set<string>();
    for (const request of requests) {
      const { taskId } = request.snapshot;
      if (taskId !== null) {
        ids.add(taskId);
      }
    }
    return [...ids];
  }

  /**
   * Method build
   *
   * @description
   * The view of one request. A task request whose task the tasks module no longer finds shows
   * `task: null` rather than leaving the request out: the people who manage the list can still
   * refuse it.
   *
   * @param {AccessRequest} request - The request.
   * @param {readonly TaskReference[]} tasks - The tasks read for the requests, in any order.
   * @returns {AccessRequestView} The view.
   */
  public build(request: AccessRequest, tasks: readonly TaskReference[]): AccessRequestView {
    const state: AccessRequestState = request.snapshot;
    const task: TaskReference | undefined =
      state.taskId === null
        ? undefined
        : tasks.find((candidate: TaskReference): boolean => candidate.id === state.taskId);
    return {
      id: state.id,
      target: state.target,
      spaceId: state.spaceId,
      listId: state.listId,
      task: task === undefined ? null : { key: task.key, name: task.name, status: task.status },
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
