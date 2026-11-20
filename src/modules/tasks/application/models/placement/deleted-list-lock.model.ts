import type { LockedDeletedList } from './locked-deleted-list.model.js';

/**
 * Interface DeletedListLock
 *
 * @description
 * What the lock of several deleted lists found for one of them (`LockDeletedLists` of the spaces
 * module): `deleted` when the list is still deleted under its lock (the spaces of the deleted
 * lists `FOR NO KEY UPDATE` in `(created_at, id)` order, then those lists `FOR UPDATE` in
 * ascending list id, held until the commit); `live` or `not-found`, neither of them locked.
 */
export interface DeletedListLock {
  // #region Properties
  /** The list. */
  readonly listId: string;

  /** What its lock found. */
  readonly outcome: LockedDeletedList['outcome'];
  // #endregion
}
