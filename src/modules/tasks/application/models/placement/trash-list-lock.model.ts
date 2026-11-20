import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { LockedDeletedList } from './locked-deleted-list.model.js';

/**
 * Interface TrashListLock
 *
 * @description
 * What the lock of the lists of trash entries found for one of them (`LockTrashLists` of the
 * spaces module), under the locks held until the commit (its space, then the list, whether live or
 * deleted): `deleted` when the list or its space is deleted, `live` otherwise, `not-found` when
 * the organization does not have it; and the role of the viewer on it as if neither were deleted,
 * read under those locks.
 */
export interface TrashListLock {
  // #region Properties
  /** The list. */
  readonly listId: string;

  /** What its lock found. */
  readonly outcome: LockedDeletedList['outcome'];

  /** The role of the viewer on it, `null` without a viewer, for a list not found or no role. */
  readonly role: AccessRole | null;
  // #endregion
}
