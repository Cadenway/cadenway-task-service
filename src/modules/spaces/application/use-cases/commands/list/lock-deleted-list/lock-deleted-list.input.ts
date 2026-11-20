/**
 * Interface LockDeletedListInput
 *
 * @description
 * A list whose deletion another module serializes with before it restores or erases a trash entry
 * of it.
 */
export interface LockDeletedListInput {
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
