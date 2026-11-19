import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { AccessRequestStatus } from '../../../domain/value-objects/access-request/access-request-status.value-object.js';
import type { AccessRequestTarget } from '../../../domain/value-objects/access-request/access-request-target.value-object.js';
import type { RequestActor } from '../../../domain/value-objects/access-request/request-actor.value-object.js';
import type { RequestedTask } from './requested-task.projection.js';

/**
 * Interface AccessRequestView
 *
 * @description
 * A request for access as the people who manage its target read it (`AccessRequest` of
 * `openapi/internal/task-service.yaml`); the requester never reads it.
 */
export interface AccessRequestView {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the request.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property target
   *
   * @description
   * What it asks for.
   *
   * @type {AccessRequestTarget}
   * @readonly
   */
  readonly target: AccessRequestTarget;

  /**
   * Property spaceId
   *
   * @description
   * The space of the target.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property listId
   *
   * @description
   * The list of a list or task target; `null` for a space.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;

  /**
   * Property task
   *
   * @description
   * The task of a task target, as it is now; `null` otherwise, or when the tasks module no longer
   * finds it.
   *
   * @type {RequestedTask | null}
   * @readonly
   */
  readonly task: RequestedTask | null;

  /**
   * Property requesterUserId
   *
   * @description
   * Account of the requester.
   *
   * @type {string}
   * @readonly
   */
  readonly requesterUserId: string;

  /**
   * Property message
   *
   * @description
   * The message of the requester; `null` when there is none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly message: string | null;

  /**
   * Property status
   *
   * @description
   * Where the request stands (`state` of the contract).
   *
   * @type {AccessRequestStatus}
   * @readonly
   */
  readonly status: AccessRequestStatus;

  /**
   * Property role
   *
   * @description
   * The role an approval gave; `null` while pending or when refused.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly role: AccessRole | null;

  /**
   * Property createdAt
   *
   * @description
   * When the request was stored.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property decidedAt
   *
   * @description
   * When it was answered; `null` while pending.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly decidedAt: Date | null;

  /**
   * Property decidedBy
   *
   * @description
   * Who answered it; `null` while pending.
   *
   * @type {RequestActor | null}
   * @readonly
   */
  readonly decidedBy: RequestActor | null;
  // #endregion
}
