import type { AccessRequestsStore } from '../../../../models/transactions/access-requests-store.model.js';

/**
 * Interface AccessRequestsUnitOfWork
 *
 * @description
 * One tenant transaction of the access-requests module, for the organization of the current
 * context. The operations of the spaces, tasks and organization-members modules the work calls
 * join it. The events appended commit with the rest; the relay is woken once a run that appended
 * events resolved.
 */
export interface AccessRequestsUnitOfWork {
  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in one tenant transaction with the store bound to it; commits when it resolves,
   * rolls back when it rejects, unless it joined the transaction of its caller.
   *
   * @param {(store: AccessRequestsStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  run<TResult>(work: (store: AccessRequestsStore) => Promise<TResult>): Promise<TResult>;

  /**
   * Method runReadOnly
   *
   * @description
   * Runs `work` in one read-only repeatable tenant snapshot. Authorization and the result
   * read the same committed state, including operations that join from other modules.
   *
   * @param {(store: AccessRequestsStore) => Promise<TResult>} work - The read.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  runReadOnly<TResult>(work: (store: AccessRequestsStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
