import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';

/**
 * Interface SpacesUnitOfWork
 *
 * @description
 * One tenant transaction of the spaces module, for the organization of the current context. A
 * route marked `@Idempotent()` already runs in the transaction its interceptor opened, and the
 * handover of private spaces in the one the deduplicator of the kit opened for its event: `run`
 * joins them. The events appended commit with the rest and wake the relay after the commit.
 */
export interface SpacesUnitOfWork {
  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in one tenant transaction with the store bound to it; commits when it resolves,
   * rolls back when it rejects, unless it joined the transaction of its caller.
   *
   * @param {(store: SpacesStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  run<TResult>(work: (store: SpacesStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
