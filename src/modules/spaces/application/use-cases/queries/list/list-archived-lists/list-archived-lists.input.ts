/**
 * Interface ListArchivedListsInput
 *
 * @description
 * A page of the archived lists of the organization a member has a role on ("Archives", tab
 * "Listes"). The caller read the role of the member from the copy of the memberships in its own
 * transaction; it never comes from the `role` claim of the token.
 */
export interface ListArchivedListsInput {
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

  /**
   * Property after
   *
   * @description
   * The last list of the previous page, when and which (`archivedAt`, `id`), in the order
   * `(archivedAt desc, id desc)`; `null` for the first page.
   *
   * @type {{ readonly archivedAt: Date; readonly id: string } | null}
   * @readonly
   */
  readonly after: { readonly archivedAt: Date; readonly id: string } | null;

  /**
   * Property limit
   *
   * @description
   * Most lists to return, at least 1 (the caller bounds it, 100 at most).
   *
   * @type {number}
   * @readonly
   */
  readonly limit: number;
  // #endregion
}
