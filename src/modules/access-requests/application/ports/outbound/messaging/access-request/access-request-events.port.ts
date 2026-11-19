import type { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { RequestPlacement } from '../../../../../domain/value-objects/access-request/request-placement.value-object.js';
import type { RequestedTarget } from '../../../../models/access-request/requested-target.model.js';

/**
 * Interface AccessRequestEvents
 *
 * @description
 * The events of the requests for access (`asyncapi/task-service.yaml`), appended to the outbox of
 * the transaction of the change: they commit with it, or not at all.
 */
export interface AccessRequestEvents {
  // #region Methods
  /**
   * Method accessRequested
   *
   * @description
   * Appends `space.access-requested.v1`, `list.access-requested.v1` or `task.access-requested.v1`
   * for a stored request, at version 1, by the requester, with the names of its target.
   *
   * @param {AccessRequest} request - The stored request.
   * @param {RequestedTarget} target - The names of its target and the owner of its space.
   * @returns {Promise<void>} Resolves once appended.
   */
  accessRequested(request: AccessRequest, target: RequestedTarget): Promise<void>;

  /**
   * Method accessRequestDecided
   *
   * @description
   * Appends `space.access-request-decided.v1`, `list.access-request-decided.v1` or
   * `task.access-request-decided.v1` for an answered request, at version 2, by who answered it,
   * naming where its target is now (the current list of the task of a task request).
   *
   * @param {AccessRequest} request - The request, answered.
   * @param {RequestPlacement} placement - Where its target is now.
   * @returns {Promise<void>} Resolves once appended.
   */
  accessRequestDecided(request: AccessRequest, placement: RequestPlacement): Promise<void>;
  // #endregion
}
