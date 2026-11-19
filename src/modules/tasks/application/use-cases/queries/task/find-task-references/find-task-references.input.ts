/**
 * Interface FindTaskReferencesInput
 *
 * @description
 * Tasks named by their ids, which another module resolves in its own transaction.
 */
export interface FindTaskReferencesInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the context.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property taskIds
   *
   * @description
   * The ids, at most 100.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly taskIds: readonly string[];
  // #endregion
}
