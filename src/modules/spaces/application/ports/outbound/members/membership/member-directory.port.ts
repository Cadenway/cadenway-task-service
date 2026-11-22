import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';

/**
 * Interface MemberDirectory
 *
 * @description
 * What the spaces module asks the copy of the memberships of the organization-members module
 * (decision 4 of the P3a plan: never the `role` claim of the internal token). Called inside the
 * tenant transaction of the use case, which the readings join.
 */
export interface MemberDirectory {
  // #region Methods
  /** Finds the unique active membership to which a resource grant will be bound. */
  grantMembershipOf(
    organizationId: string,
    userId: string,
    lock?: boolean,
  ): Promise<{ readonly memberId: string; readonly role: MemberRole } | null>;

  /**
   * Method roleOf
   *
   * @description
   * The role of an account that is a current member of the organization.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {boolean} [lock] - `true` in a write: the membership stays locked `FOR SHARE` until the
   * commit, so that a concurrent removal waits for the write and its handover sees it.
   * @returns {Promise<MemberRole | null>} Its role, or `null` when the copy does not hold it as a
   * member: removed, or not learnt yet.
   */
  roleOf(organizationId: string, userId: string, lock?: boolean): Promise<MemberRole | null>;

  /**
   * Method ownerOf
   *
   * @description
   * The account that owns the organization.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @returns {Promise<string | null>} Its account, or `null` while the copy has not learnt it.
   */
  ownerOf(organizationId: string): Promise<string | null>;
  // #endregion
}
