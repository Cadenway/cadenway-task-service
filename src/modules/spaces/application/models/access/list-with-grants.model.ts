import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { AccessSpace } from '../../../domain/policies/access/access-role.policy.js';
import type { ListGrants } from '../../../domain/value-objects/access/list-grants.value-object.js';

/**
 * Interface ListWithGrants
 *
 * @description
 * A list of a collection read for a member, with what the effective role reads of its space and
 * the grants of the member on the space and the list, so that the application computes the role of
 * each row with `listRoleOf`.
 */
export interface ListWithGrants {
  // #region Properties
  /**
   * Property list
   *
   * @description
   * The list.
   *
   * @type {TaskList}
   * @readonly
   */
  readonly list: TaskList;

  /**
   * Property space
   *
   * @description
   * The visibility, the owner, the tombstone and whether the space of the list awaits an owner.
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
