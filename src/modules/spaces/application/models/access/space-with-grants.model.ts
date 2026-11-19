import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { ViewerGrants } from './viewer-grants.model.js';

/**
 * Interface SpaceWithGrants
 *
 * @description
 * A space of a collection read for a member, with the grants of the member there, so that the
 * application computes the role of each row with the policies of the domain.
 */
export interface SpaceWithGrants {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The space.
   *
   * @type {Space}
   * @readonly
   */
  readonly space: Space;

  /**
   * Property grants
   *
   * @description
   * The grant of the member on the space and whether they hold one of any of its lists (`list` is
   * always `null`).
   *
   * @type {ViewerGrants}
   * @readonly
   */
  readonly grants: ViewerGrants;
  // #endregion
}
