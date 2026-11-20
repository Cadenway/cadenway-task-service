import type { Membership } from '../../../../../domain/aggregates/membership/membership.aggregate.js';
import type { ListActiveMembersInput } from '../../../../use-cases/queries/membership/list-active-members/list-active-members.input.js';
import type { ListActiveMembersOutput } from '../../../../use-cases/queries/membership/list-active-members/list-active-members.output.js';

/**
 * Interface MembershipRepository
 *
 * @description
 * The copy of the memberships, bound to the tenant transaction of a unit of work: row-level
 * security limits it to the organization of the context, and every method names that organization
 * again.
 */
export interface MembershipRepository {
  // #region Methods
  /**
   * Method lock
   *
   * @description
   * Loads a membership by its organization and its id and locks it until the end of the
   * transaction.
   *
   * @param {string} organizationId - The organization of the event.
   * @param {string} id - The `memberId`.
   * @returns {Promise<Membership | null>} The membership, or `null` when this service has not seen it.
   */
  lock(organizationId: string, id: string): Promise<Membership | null>;

  /**
   * Method insertIfAbsent
   *
   * @description
   * Stores a membership seen for the first time, unless a concurrent transaction stored it first.
   *
   * @param {Membership} membership - The new copy.
   * @returns {Promise<boolean>} Whether it was inserted; `false` when the organization already holds
   * that id.
   */
  insertIfAbsent(membership: Membership): Promise<boolean>;

  /**
   * Method update
   *
   * @description
   * Writes the role, the version and the removal of a membership locked by `lock`.
   *
   * @param {Membership} membership - The membership after the change.
   * @returns {Promise<void>} Resolves once written.
   */
  update(membership: Membership): Promise<void>;

  /**
   * Method listActiveByUser
   *
   * @description
   * The active memberships of an account in an organization: one, or two for the time a removal
   * and a new join of the same person cross, in a stable order.
   *
   * @param {string} organizationId - The organization.
   * @param {string} userId - The account.
   * @param {boolean} lock - Whether to lock them `FOR SHARE` until the end of the transaction.
   * @returns {Promise<Membership[]>} The memberships, empty when the account is not a member.
   */
  listActiveByUser(organizationId: string, userId: string, lock: boolean): Promise<Membership[]>;

  /** Pages current accounts, selecting a least-privileged membership before applying the audience. */
  listActivePage(input: ListActiveMembersInput): Promise<readonly ListActiveMembersOutput[]>;

  /**
   * Method findActiveOwner
   *
   * @description
   * The active membership with the role `owner` of an organization: organization-service gives it
   * to the creator and never removes nor changes it, so there is one, the earliest stored should
   * the copy ever hold two.
   *
   * @param {string} organizationId - The organization.
   * @returns {Promise<Membership | null>} The membership of the owner, or `null` while its
   * `member.joined.v1` has not reached the copy.
   */
  findActiveOwner(organizationId: string): Promise<Membership | null>;
  // #endregion
}
