import type { DeletedListBatch } from '../../../../models/deletion/deleted-list-batch.model.js';
import type { RootPosition } from '../../../../models/deletion/root-position.model.js';

/**
 * Interface DeletedListTasks
 *
 * @description
 * What the deletion job does to the tasks of a deleted list, owned by this module and bound to the
 * public operation `TrashDeletedListTasks` of the tasks module.
 */
export interface DeletedListTasks {
  // #region Methods
  /**
   * Method trashBatch
   *
   * @description
   * Moves one batch of the tasks of a deleted list to the trash, in the tenant transaction of the
   * caller, which it joins: up to 50 roots after `after` (live top-level tasks with their live
   * subtree, and archives with their members), until the batch holds 500 tasks or more, one entry
   * per root, with the actor of the deletion and one `task.trashed.v1` per task. It writes nothing
   * once the list is no longer deleted. With no root left, it erases the tombstone of the list (and
   * of its space) when no task references it any more.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {string} listId - The deleted list.
   * @param {RootPosition | null} after - The last root of the previous batch of the attempt, `null`
   * for the first.
   * @returns {Promise<DeletedListBatch>} What the batch did.
   * @throws {Error} When the batch fails: the transaction rolls back.
   */
  trashBatch(
    organizationId: string,
    listId: string,
    after: RootPosition | null,
  ): Promise<DeletedListBatch>;
  // #endregion
}
