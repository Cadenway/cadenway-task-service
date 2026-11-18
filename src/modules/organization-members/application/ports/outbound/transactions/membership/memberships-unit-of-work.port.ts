import type { MembershipRepository } from '../../persistence/membership/membership-repository.port.js';

/**
 * Interface MembershipsUnitOfWork
 *
 * @description
 * One tenant transaction of the organization-members module, for the organization of the current
 * context. The handler of a member event joins the transaction the deduplicator of the kit opened
 * for the organization of the event; a query of another module joins the tenant transaction of its
 * caller, or opens one when there is none.
 */
export interface MembershipsUnitOfWork {
  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in one tenant transaction with the repository bound to it; commits when it
   * resolves, rolls back when it rejects, unless it joined the transaction of its caller.
   *
   * @param {(memberships: MembershipRepository) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  run<TResult>(work: (memberships: MembershipRepository) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
