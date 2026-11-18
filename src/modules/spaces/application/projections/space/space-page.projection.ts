import type { PagePosition } from '../../models/page/page-position.model.js';
import type { SpaceView } from './space-view.projection.js';

/**
 * Interface SpacePage
 *
 * @description
 * One page of the spaces the actor sees, in the order of their creation.
 */
export interface SpacePage {
  // #region Properties
  /**
   * Property items
   *
   * @description
   * The spaces of the page.
   *
   * @type {readonly SpaceView[]}
   * @readonly
   */
  readonly items: readonly SpaceView[];

  /**
   * Property next
   *
   * @description
   * Where the next page starts, `null` on the last page.
   *
   * @type {PagePosition | null}
   * @readonly
   */
  readonly next: PagePosition | null;
  // #endregion
}
