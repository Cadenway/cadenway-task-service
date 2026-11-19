import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface TargetAccess
 *
 * @description
 * A space or a list of the organization as the spaces module describes it to this module: where
 * it is, its names, the owner of its space, and the access of one member on it.
 */
export interface TargetAccess {
  // #region Properties
  /**
   * Property kind
   *
   * @description
   * Whether it is a space or a list.
   *
   * @type {'space' | 'list'}
   * @readonly
   */
  readonly kind: 'space' | 'list';

  /**
   * Property spaceId
   *
   * @description
   * The space, or the space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property spaceName
   *
   * @description
   * Name of that space.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceName: string;

  /**
   * Property spaceOwnerUserId
   *
   * @description
   * Account of the owner of that space.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceOwnerUserId: string;

  /**
   * Property listId
   *
   * @description
   * The list; `null` for a space.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;

  /**
   * Property listName
   *
   * @description
   * Name of the list; `null` for a space.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listName: string | null;

  /**
   * Property viewerRole
   *
   * @description
   * The role of the member on the space for a space, on the list for a list; `null` for none.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly viewerRole: AccessRole | null;

  /**
   * Property viewerManages
   *
   * @description
   * Whether the member answers its requests: manages the space, or has `edit` on the list.
   *
   * @type {boolean}
   * @readonly
   */
  readonly viewerManages: boolean;
  // #endregion
}
