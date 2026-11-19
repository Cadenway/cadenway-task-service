/**
 * Interface RestoreArchivedListInput
 *
 * @description
 * The list of an archived task another module restores, and the member who restores it. The
 * caller read the role of the member from the copy of the memberships in its own transaction; it
 * never comes from the `role` claim of the token.
 */
export interface RestoreArchivedListInput {
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
   * Property actorUserId
   *
   * @description
   * The account of the member who restores the task, the actor of `list.unarchived.v1`.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

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
