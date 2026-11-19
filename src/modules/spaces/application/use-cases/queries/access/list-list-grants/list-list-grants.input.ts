import type { PagePosition } from '../../../../models/page/page-position.model.js';

/**
 * Interface ListListGrantsInput
 *
 * @description
 * Which page of the grants of a list to read.
 */
export interface ListListGrantsInput {
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
   * The size of the page, at least 1.
   *
   * @type {number}
   * @readonly
   */
  readonly limit: number;
  // #endregion
}
