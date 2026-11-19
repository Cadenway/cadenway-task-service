import type { AccessSpace } from '../../../domain/policies/access/access-role.policy.js';
import type { ListGrants } from '../../../domain/value-objects/access/list-grants.value-object.js';

/**
 * Interface ListAccess
 *
 * @description
 * What the effective role of a member on one list reads, and nothing else of the list: its id, its
 * space, its switch "Accès de l’organisation", what the role reads of the space, and the grants
 * of the member on the space and the list. The lean row of the collections that need only roles.
 */
export interface ListAccess {
  // #region Properties
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
   * Property spaceId
   *
   * @description
   * The id of the space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property organizationAccess
   *
   * @description
   * The switch "Accès de l’organisation" of the list.
   *
   * @type {boolean}
   * @readonly
   */
  readonly organizationAccess: boolean;

  /**
   * Property space
   *
   * @description
   * The visibility, the owner and whether the space of the list awaits an owner.
   *
   * @type {AccessSpace}
   * @readonly
   */
  readonly space: AccessSpace;

  /**
   * Property grants
   *
   * @description
   * The grants of the member on the space and on the list.
   *
   * @type {ListGrants}
   * @readonly
   */
  readonly grants: ListGrants;
  // #endregion
}
