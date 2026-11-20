/**
 * Interface DeletionUnitOfWork
 *
 * @description
 * One tenant transaction of the organization of the context of a deletion job. The operations of
 * the tasks, spaces and access-requests modules the work calls join it, so what they write, with
 * the events they append to the outbox, commits together or not at all.
 */
export interface DeletionUnitOfWork {
  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in one tenant transaction; commits when it resolves, rolls back when it rejects.
   *
   * @param {() => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  run<TResult>(work: () => Promise<TResult>): Promise<TResult>;
  // #endregion
}
