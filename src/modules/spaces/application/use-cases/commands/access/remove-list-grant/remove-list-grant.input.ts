/**
 * Interface RemoveListGrantInput
 *
 * @description
 * The grant of a person to remove from a list
 * (`DELETE /internal/v1/lists/{listId}/grants/{userId}`).
 */
export interface RemoveListGrantInput {
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
   * Property userId
   *
   * @description
   * The account of the person whose grant to remove, lower-cased.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property expectedVersions
   *
   * @description
   * The versions of the list `If-Match` accepts, `null` without the header.
   *
   * @type {readonly number[] | null}
   * @readonly
   */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
