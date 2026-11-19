import type { ResourceGrants } from '../../aggregates/access/resource-grants.aggregate.js';
import type { AccessRole } from './access-role.value-object.js';

/**
 * Interface GrantsUpdate
 *
 * @description
 * The result of a change of the grants of a space or a list: the grants after it, whether
 * anything changed (nothing to store, no version to take and no event to emit otherwise), and the
 * role the person holds after it (`null` once removed).
 */
export interface GrantsUpdate {
  // #region Properties
  /**
   * Property grants
   *
   * @description
   * The grants after the change; the same instance when nothing changed.
   *
   * @type {ResourceGrants}
   * @readonly
   */
  readonly grants: ResourceGrants;

  /**
   * Property changed
   *
   * @description
   * Whether a grant was given, changed or removed.
   *
   * @type {boolean}
   * @readonly
   */
  readonly changed: boolean;

  /**
   * Property role
   *
   * @description
   * The role the person holds after the change, `null` when they hold no grant.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly role: AccessRole | null;
  // #endregion
}
