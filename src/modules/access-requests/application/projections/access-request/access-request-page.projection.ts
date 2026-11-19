import type { PagePosition } from '../../models/page/page-position.model.js';
import type { AccessRequestView } from './access-request-view.projection.js';

/**
 * Interface AccessRequestPage
 *
 * @description
 * One page of the pending requests a member answers, the most recent first, with where the next
 * page starts and how many match on every page (`AccessRequestPage` of the contract).
 */
export interface AccessRequestPage {
  // #region Properties
  /**
   * Property items
   *
   * @description
   * The requests of the page.
   *
   * @type {readonly AccessRequestView[]}
   * @readonly
   */
  readonly items: readonly AccessRequestView[];

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

  /**
   * Property total
   *
   * @description
   * The pending requests that match the filters, on every page.
   *
   * @type {number}
   * @readonly
   */
  readonly total: number;
  // #endregion
}
