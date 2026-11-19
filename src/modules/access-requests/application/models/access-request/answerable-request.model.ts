import type { AccessRequest } from '../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';
import type { RequestPlacement } from '../../../domain/value-objects/access-request/request-placement.value-object.js';
import type { TaskReference } from '../task/task-reference.model.js';

/**
 * Interface AnswerableRequest
 *
 * @description
 * A request the actor may answer, locked in the transaction of the answer, with where its target
 * is now, its task as it is now for a task request, and the role of the actor in the organization.
 */
export interface AnswerableRequest {
  // #region Properties
  /**
   * Property request
   *
   * @description
   * The request, locked `FOR UPDATE`, pending or not.
   *
   * @type {AccessRequest}
   * @readonly
   */
  readonly request: AccessRequest;

  /**
   * Property placement
   *
   * @description
   * Where its target is now: for a task request, the current list of the task.
   *
   * @type {RequestPlacement}
   * @readonly
   */
  readonly placement: RequestPlacement;

  /**
   * Property task
   *
   * @description
   * The task of a task request as it is now; `null` for a space or a list request.
   *
   * @type {TaskReference | null}
   * @readonly
   */
  readonly task: TaskReference | null;

  /**
   * Property actorRole
   *
   * @description
   * The role of the actor in the organization, from the copy of the memberships.
   *
   * @type {MemberRole}
   * @readonly
   */
  readonly actorRole: MemberRole;
  // #endregion
}
