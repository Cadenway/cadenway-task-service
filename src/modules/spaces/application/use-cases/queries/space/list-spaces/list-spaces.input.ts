import type { PagePosition } from '../../../../models/page/page-position.model.js';

/**
 * Interface ListSpacesInput
 *
 * @description
 * Which page of the spaces the actor sees.
 */
export interface ListSpacesInput {
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
   * Property after
   *
   * @description
   * Where the page starts, `null` for the first page.
   *
   * @type {PagePosition | null}
   * @readonly
   */
  readonly after: PagePosition | null;

  /**
   * Property limit
   *
   * @description
   * Page size, 1 to 100.
   *
   * @type {number}
   * @readonly
   */
  readonly limit: number;
  // #endregion
}
