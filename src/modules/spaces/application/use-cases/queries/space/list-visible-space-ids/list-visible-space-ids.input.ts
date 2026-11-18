/**
 * Interface ListVisibleSpaceIdsInput
 *
 * @description
 * The member whose visible spaces another module wants to filter a collection by. The caller read
 * the role of the member from the copy of the memberships in its own transaction; it never comes
 * from the `role` claim of the token.
 */
export interface ListVisibleSpaceIdsInput {
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
   * The account of the member.
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
  // #endregion
}
