import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';

/**
 * Interface MemberDirectory
 *
 * @description
 * What the tasks module asks the copy of the memberships of the organization-members module
 * (decision 4 of the P3a plan: never the `role` claim of the internal token). Called inside the
 * tenant transaction of the use case, which the readings join.
 */
export interface MemberDirectory {
  // #region Methods
  /**
   * Method roleOf
   *
   * @description
   * The role of an account that is a current member of the organization.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {boolean} [lock] - `true` in a write: the membership stays locked `FOR SHARE` until the
   * commit, so that a concurrent removal waits for the write and its unassignment sees it.
   * @returns {Promise<MemberRole | null>} Its role, or `null` when the copy does not hold it as a
   * member: removed, or not learnt yet.
   */
  roleOf(organizationId: string, userId: string, lock?: boolean): Promise<MemberRole | null>;
  // #endregion
}
