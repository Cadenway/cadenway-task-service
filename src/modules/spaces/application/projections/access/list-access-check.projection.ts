import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface ListAccessCheck
 *
 * @description
 * What the realtime gateway reads before a socket joins the room of a list (`AccessCheck` of
 * `openapi/internal/task-service.yaml`, `taskKey` always `null` for a list): the role of the
 * person and where the list is.
 */
export interface ListAccessCheck {
  // #region Properties
  /**
   * Property role
   *
   * @description
   * The effective role of the person on the list.
   *
   * @type {AccessRole}
   * @readonly
   */
  readonly role: AccessRole;

  /**
   * Property spaceId
   *
   * @description
   * The space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property listId
   *
   * @description
   * The list checked.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;
  // #endregion
}
