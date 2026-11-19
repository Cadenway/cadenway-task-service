import type { TrashPurgeQueue } from '../../ports/outbound/jobs/trash/trash-purge-queue.port.js';

/**
 * Interface TrashPurgeScheduleStore
 *
 * @description
 * What the daily schedule of the purge writes, bound to the system transaction of one run of its
 * unit of work: the purge jobs it enqueues commit together, or none does.
 */
export interface TrashPurgeScheduleStore {
  // #region Properties
  /** The purge jobs of the organizations, enqueued in the transaction. */
  readonly purges: TrashPurgeQueue;
  // #endregion
}
