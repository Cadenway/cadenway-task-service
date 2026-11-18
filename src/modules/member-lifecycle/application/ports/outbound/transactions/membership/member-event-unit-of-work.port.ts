/**
 * Interface MemberEventUnitOfWork
 *
 * @description
 * The tenant transaction of the organization of a member event, in which the copy of the
 * memberships and every effect of the event commit together. From the handler, `run` joins the
 * transaction the deduplicator of the kit opened for the delivery, with its processed id; from any
 * other caller, it opens one for the organization of the context.
 */
export interface MemberEventUnitOfWork {
  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in one tenant transaction; commits when it resolves, rolls back when it rejects,
   * unless it joined the transaction of its caller, whose outcome it then shares.
   *
   * @param {() => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  run<TResult>(work: () => Promise<TResult>): Promise<TResult>;
  // #endregion
}
