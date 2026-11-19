/**
 * Interface PendingScope
 *
 * @description
 * Which pending requests a member reads ("List the pending access requests" of
 * `openapi/public/access.yaml`): the space requests of the spaces they manage, the list and task
 * requests of the lists they have `edit` on, narrowed by the `spaceId` and `listId` filters.
 */
export interface PendingScope {
  // #region Properties
  /**
   * Property spaceIds
   *
   * @description
   * The spaces the member manages, whose space requests they answer.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly spaceIds: readonly string[];

  /**
   * Property listIds
   *
   * @description
   * The lists the member has `edit` on, whose list and task requests they answer.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];

  /**
   * Property spaceId
   *
   * @description
   * Keeps the requests of this space, its lists and their tasks; `null` for no filter.
   *
   * @type {string | null}
   * @readonly
   */
  readonly spaceId: string | null;

  /**
   * Property listId
   *
   * @description
   * Keeps the requests of this list and its tasks; `null` for no filter.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;
  // #endregion
}
