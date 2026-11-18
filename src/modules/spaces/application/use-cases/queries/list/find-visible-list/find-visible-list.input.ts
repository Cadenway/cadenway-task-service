/**
 * Interface FindVisibleListInput
 *
 * @description
 * A list another module wants to place a task in, and the member who asks. The caller read the role
 * of the member from the copy of the memberships in its own transaction; it never comes from the
 * `role` claim of the token.
 */
export interface FindVisibleListInput {
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
   * Property listId
   *
   * @description
   * The id of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;
  // #endregion
}
