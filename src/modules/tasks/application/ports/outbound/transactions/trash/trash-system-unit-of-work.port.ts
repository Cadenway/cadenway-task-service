import type { TrashSystemStore } from '../../../../models/transactions/trash-system-store.model.js';

/**
 * Interface TrashSystemUnitOfWork
 *
 * @description
 * One read-only system transaction of the tasks module, across organizations: row-level security
 * lets it read every organization, so each statement names the rows it reads. It is never joined
 * to a tenant transaction (the runner refuses it) and reads ids only.
 */
export interface TrashSystemUnitOfWork {
  // #region Methods
  /**
   * Method runReadOnly
   *
   * @description
   * Runs `work` in one read-only system transaction.
   *
   * @param {(store: TrashSystemStore) => Promise<TResult>} work - The read.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  runReadOnly<TResult>(work: (store: TrashSystemStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
