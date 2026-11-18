import type { ReadOptions } from '../../../../models/transactions/read-options.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';

/**
 * Interface TasksUnitOfWork
 *
 * @description
 * One tenant transaction of the tasks module, for the organization of the current context. A route
 * marked `@Idempotent()` already runs in the transaction its interceptor opened, and the removal of
 * a member in the one the deduplicator of the kit opened for its event: `run` joins them. The
 * events appended commit with the rest. The outbox relay is woken when a run that appended events
 * resolves: for a run that opened its own transaction that is after the commit, so the events
 * leave now; for a joined run it is before the outer commit, so the pass it wakes does not see
 * the rows yet and they leave at the next poll of the relay.
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

  /**
   * Method runReadOnly
   *
   * @description
   * Runs `work` in one read-only tenant transaction: any write the work attempts fails in the
   * database, and a query takes no row lock. With `options.snapshot` the transaction is
   * `REPEATABLE READ`, so every statement of the query reads the same committed state. The
   * operations of the other modules the work calls join it. A caller that is already inside a
   * transaction must have opened it with these requirements, or the run is refused.
   *
   * @param {(store: TasksStore) => Promise<TResult>} work - The read.
   * @param {ReadOptions} [options] - How the run sees the database.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  runReadOnly<TResult>(
    work: (store: TasksStore) => Promise<TResult>,
    options?: ReadOptions,
  ): Promise<TResult>;
  // #endregion
}
