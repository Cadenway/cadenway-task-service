/**
 * Interface ListCurrentSprintsInput
 *
 * @description
 * The member who asks for the sprints under way, and the day it is. The caller read the role of the
 * member from the copy of the memberships in its own transaction; it never comes from the `role`
 * claim of the token.
 */
export interface ListCurrentSprintsInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the context, the one of the tenant transaction the use case joins.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property viewerUserId
   *
   * @description
   * The account of the member who asks.
   *
   * @type {string}
   * @readonly
   */
  readonly viewerUserId: string;

  /**
   * Property viewerRole
   *
   * @description
   * The role of the member in the organization, as the copy of the memberships holds it.
   *
   * @type {'owner' | 'admin' | 'member' | 'guest'}
   * @readonly
   */
  readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';

  /**
   * Property today
   *
   * @description
   * The calendar date of the caller (`YYYY-MM-DD`), which the service does not know.
   *
   * @type {string}
   * @readonly
   */
  readonly today: string;

  /**
   * Property limit
   *
   * @description
   * Most lists to return, a positive integer.
   *
   * @type {number}
   * @readonly
   */
  readonly limit: number;
  // #endregion
}
