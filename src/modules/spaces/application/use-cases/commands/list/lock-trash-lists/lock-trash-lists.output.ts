/**
 * Interface LockTrashListsOutput
 *
 * @description
 * Where each list stands under the locks the caller now holds until the end of its transaction:
 * `deleted` for a tombstone (the list or its space deleted), `live` for a list that is not deleted
 * (archived or not), `not-found` for a list the organization does not have (unknown, or erased
 * meanwhile), each read again under the lock; and the role of the viewer on it, read under the
 * locks.
 */
export interface LockTrashListsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * One answer per distinct id of the input, in the order first given. `role` is the role of the
   * viewer as if neither the list nor its space were deleted, `null` without a viewer, for a list
   * not found, or when the viewer has no role on it.
   *
   * @type {readonly { listId: string; outcome: 'deleted' | 'live' | 'not-found'; role: 'edit' | 'comment' | 'view' | null }[]}
   * @readonly
   */
  readonly lists: readonly {
    readonly listId: string;
    readonly outcome: 'deleted' | 'live' | 'not-found';
    readonly role: 'edit' | 'comment' | 'view' | null;
  }[];
  // #endregion
}
