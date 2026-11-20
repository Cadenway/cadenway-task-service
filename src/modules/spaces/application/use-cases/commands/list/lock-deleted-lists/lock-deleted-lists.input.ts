/**
 * Interface LockDeletedListsInput
 *
 * @description
 * The lists whose deletion another module serializes with before it erases trash entries of them.
 */
export interface LockDeletedListsInput {
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
   * Property listIds
   *
   * @description
   * The ids of the lists, 100 at most, in any order; an id given twice is answered once.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];
  // #endregion
}
