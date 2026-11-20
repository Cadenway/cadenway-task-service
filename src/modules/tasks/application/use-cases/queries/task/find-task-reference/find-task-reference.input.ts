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
   * `share-unless-locked` to lock the task of the key `FOR SHARE SKIP LOCKED` until the commit of
   * the caller, in the same statement whatever the outcome, so a concurrent deletion of the task
   * either committed before (the task reads as not found) or waits for the caller, and a task a
   * writer holds reads as not found at once, without waiting; `none` (the default) for a read
   * without a lock.
   *
   * @type {'none' | 'share-unless-locked' | undefined}
   * @readonly
   */
  readonly lock?: 'none' | 'share-unless-locked';
  // #endregion
}
