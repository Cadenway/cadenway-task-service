import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';

/**
 * Interface TasksUnitOfWork
 *
 * @description
 * One tenant transaction of the tasks module, for the organization of the current context. A route
 * marked `@Idempotent()` already runs in the transaction its interceptor opened, and the removal of
 * a member in the one the deduplicator of the kit opened for its event: `run` joins them. The
 * events appended commit with the rest and wake the relay after the commit.
 */
export interface TasksUnitOfWork {
  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in one tenant transaction with the store bound to it; commits when it resolves,
   * rolls back when it rejects, unless it joined the transaction of its caller.
   *
   * @param {(store: TasksStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  run<TResult>(work: (store: TasksStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
