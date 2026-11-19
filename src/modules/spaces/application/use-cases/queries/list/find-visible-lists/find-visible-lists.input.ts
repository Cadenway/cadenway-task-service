/**
 * Interface FindVisibleListsInput
 *
 * @description
 * Some lists another module shows (the lists of the archived tasks of a page), and the member who
 * asks. The caller read the role of the member from the copy of the memberships in its own
 * transaction; it never comes from the `role` claim of the token.
 */
export interface FindVisibleListsInput {
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
   * Property listIds
   *
   * @description
   * The ids of the lists, 100 at most; an id that is not a UUID names no list.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];
  // #endregion
}
