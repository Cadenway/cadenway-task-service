/**
 * Interface LockDeletedListsOutput
 *
 * @description
 * Where each list stands for a caller that serializes with their deletion, as for
 * `LockDeletedListOutput`: `deleted` for a tombstone locked `FOR UPDATE` (after its space
 * `FOR NO KEY UPDATE`) until the end of the transaction of the caller and read again under the
 * lock; `live` for a list that is not deleted (archived or not) or was restored meanwhile, without
 * lock when it was live from the start; `not-found` for a list the organization does not have
 * (unknown, or erased meanwhile), without lock when it was unknown from the start.
 */
export interface LockDeletedListsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * One answer per distinct id of the input, in the order first given.
   *
   * @type {readonly { listId: string; outcome: 'deleted' | 'live' | 'not-found' }[]}
   * @readonly
   */
  readonly lists: readonly {
    readonly listId: string;
    readonly outcome: 'deleted' | 'live' | 'not-found';
  }[];
  // #endregion
}
