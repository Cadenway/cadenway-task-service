import type { RemovedMemberCleanUpQueue } from '../../ports/outbound/jobs/membership/removed-member-clean-up-queue.port.js';

/**
 * Interface MemberEventStore
 *
 * @description
 * What a member event writes beside the copy of the memberships, bound to the tenant transaction
 * of the event: what it writes commits with the copy and the processed event id, or not at all.
 */
export interface MemberEventStore {
  // #region Properties
  /** The clean-up jobs of the members who left, enqueued in the transaction. */
  readonly cleanUps: RemovedMemberCleanUpQueue;
  // #endregion
}
