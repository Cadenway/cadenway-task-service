import type { GrantEntry } from './grant-entry.value-object.js';
import type { GrantResource } from './grant-resource.value-object.js';

/**
 * Interface ResourceGrantsState
 *
 * @description
 * Every grant of one space or one list, in the order they were first given, with what the rules
 * of a grant read: whether it is a space or a list, and the owner of the space.
 */
export interface ResourceGrantsState {
  // #region Properties
  /**
   * Property resource
   *
   * @description
   * Whether the grants are those of a space or of a list.
   *
   * @type {GrantResource}
   * @readonly
   */
  readonly resource: GrantResource;

  /**
   * Property ownerUserId
   *
   * @description
   * Account of the owner of the space (of the list), who holds no grant.
   *
   * @type {string}
   * @readonly
   */
  readonly ownerUserId: string;

  /**
   * Property grants
   *
   * @description
   * The grants, in the order they were first given, one per person.
   *
   * @type {readonly GrantEntry[]}
   * @readonly
   */
  readonly grants: readonly GrantEntry[];
  // #endregion
}
