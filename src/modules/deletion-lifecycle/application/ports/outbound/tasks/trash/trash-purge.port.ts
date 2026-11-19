import type { TrashPurgeBatch } from '../../../../models/trash/trash-purge-batch.model.js';

/**
 * Interface TrashPurge
 *
 * @description
 * What the purge job does to the trash of the tasks module, owned by this module and bound to the
 * public operation `PurgeTrashBatch` of the tasks module.
 */
export interface TrashPurge {
  // #region Methods
  /**
   * Method purgeBatch
   *
   * @description
   * Erases one batch of the trash of the organization in its own tenant transaction: the entries
   * "Vider la corbeille" handed over first, else those due, `for update skip locked`, up to 20
   * entries until 500 tasks or more, each with its `task.purged.v1` per task, then the tombstones of
   * the deleted lists and spaces left without a task. An erased entry is not taken again, so the job
   * asks until `none-left`.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @returns {Promise<TrashPurgeBatch>} What the batch did.
   * @throws {Error} When the batch fails: it rolls back alone.
   */
  purgeBatch(organizationId: string): Promise<TrashPurgeBatch>;
  // #endregion
}
