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

  /**
   * Property lock
   *
   * @description
   * `share` to lock the task of the key `FOR SHARE` until the commit of the caller, in the same
   * statement whatever the outcome, so a concurrent deletion of the task either committed before
   * (the task reads as not found) or waits for the caller; `none` (the default) for a read without
   * a lock.
   *
   * @type {'none' | 'share' | undefined}
   * @readonly
   */
  readonly lock?: 'none' | 'share';
  // #endregion
}
