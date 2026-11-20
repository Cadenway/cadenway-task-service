/**
 * Interface ListVisibleListIdsInput
 *
 * @description
 * The member whose visible lists another module filters a collection by ("Mes tâches",
 * "Accueil", the labels, the activity of a list).
 */
export interface ListVisibleListIdsInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the context, the one of the tenant transaction the use case
   * joins.
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
   * The role of the member in the organization, as the copy of the memberships holds it;
   * the caller read it in its own transaction, never from the `role` claim of the token.
   *
   * @type {'owner' | 'admin' | 'member' | 'guest'}
   * @readonly
   */
  readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';

  /** Limits the returned ids to lists the viewer may edit. */
  readonly editOnly?: boolean;

  /** Excludes archived lists when the caller needs live work only. */
  readonly liveOnly?: boolean;
  // #endregion
}
