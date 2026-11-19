import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface SetListGrantInput
 *
 * @description
 * A role to give a person on a list (`PUT /internal/v1/lists/{listId}/grants/{userId}`).
 */
export interface SetListGrantInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account of the actor of the internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property listId
   *
   * @description
   * The id of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property userId
   *
   * @description
   * The account of the person given access, lower-cased.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property role
   *
   * @description
   * The role to give ("Droit d’accès").
   *
   * @type {AccessRole}
   * @readonly
   */
  readonly role: AccessRole;

  /**
   * Property expectedVersions
   *
   * @description
   * The versions of the list `If-Match` accepts, `null` without the header.
   *
   * @type {readonly number[] | null}
   * @readonly
   */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
