import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { EventActor } from '../actor/event-actor.model.js';

/**
 * Interface StoredGrant
 *
 * @description
 * One stored grant of a space or a list (`Grant` of `openapi/internal/task-service.yaml`), with
 * when the person was first given access, the order of the listings and of the access events.
 */
export interface StoredGrant {
  // #region Properties
  /**
   * Property userId
   *
   * @description
   * Account of the person given access.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property role
   *
   * @description
   * The role the grant gives.
   *
   * @type {AccessRole}
   * @readonly
   */
  readonly role: AccessRole;

  /**
   * Property createdAt
   *
   * @description
   * When the person was first given access to the resource; it stays when the role changes.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property grantedAt
   *
   * @description
   * When the person was given this role (`grantedAt`).
   *
   * @type {Date}
   * @readonly
   */
  readonly grantedAt: Date;

  /**
   * Property grantedBy
   *
   * @description
   * Who gave this role (`grantedBy`): a member, or task-service.
   *
   * @type {EventActor}
   * @readonly
   */
  readonly grantedBy: EventActor;
  // #endregion
}
