/**
 * Interface FindTaskReferenceInput
 *
 * @description
 * A task named by its key, which another module resolves in its own transaction.
 */
export interface FindTaskReferenceInput {
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
   * Property taskKey
   *
   * @description
   * The key as received; a malformed key finds nothing.
   *
   * @type {string}
   * @readonly
   */
  readonly taskKey: string;
  // #endregion
}
