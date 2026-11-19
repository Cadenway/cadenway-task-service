import type { TrashPurgeScheduleStore } from '../../../../models/transactions/trash-purge-schedule-store.model.js';

/**
 * Interface TrashPurgeScheduleUnitOfWork
 *
 * @description
 * The system transaction in which the daily schedule enqueues the purge jobs of one page of
 * organizations. A schedule runs outside any organization, so it is a system transaction, and it
 * only inserts job rows: it reads and writes no table of an organization.
 */
export interface TrashPurgeScheduleUnitOfWork {
  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in one system transaction with a store bound to it; commits when it resolves, rolls
   * back when it rejects.
   *
   * @param {(store: TrashPurgeScheduleStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with, once committed.
   */
  run<TResult>(work: (store: TrashPurgeScheduleStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
