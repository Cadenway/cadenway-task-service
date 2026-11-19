import type { AccessRole } from '../access/access-role.value-object.js';
import type { AccessRequestDraft } from './access-request-draft.value-object.js';
import type { AccessRequestStatus } from './access-request-status.value-object.js';
import type { RequestActor } from './request-actor.value-object.js';

/**
 * Interface AccessRequestState
 *
 * @description
 * A stored request for access (`AccessRequest` of `openapi/internal/task-service.yaml`): what was
 * asked, by whom, and how it was answered. `role`, `decidedAt` and `decidedBy` are set together
 * with the decision, `role` for an approval only.
 */
export interface AccessRequestState extends AccessRequestDraft {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * The id PostgreSQL gave the request (`uuidv7()`).
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property status
   *
   * @description
   * Where the request stands.
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
   * When the request was stored, to the millisecond.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property decidedAt
   *
   * @description
   * When it was approved or refused; `null` while pending.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly decidedAt: Date | null;

  /**
   * Property decidedBy
   *
   * @description
   * Who approved or refused it; `null` while pending.
   *
   * @type {RequestActor | null}
   * @readonly
   */
  readonly decidedBy: RequestActor | null;
  // #endregion
}
