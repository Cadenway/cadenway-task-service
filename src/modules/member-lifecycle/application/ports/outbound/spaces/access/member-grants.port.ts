import type { GrantRemovalBatch } from '../../../../models/clean-up/grant-removal-batch.model.js';

/**
 * Interface MemberGrants
 *
 * @description
 * What the clean-up after a member removal does to the grants of the spaces module, owned by this
 * module and bound to the public operation `RemoveMemberGrants` of spaces.
 */
export interface MemberGrants {
  // #region Methods
  /**
   * Method removeBatch
   *
   * @description
   * Removes one batch of the grants of spaces and lists a former member held, in its own tenant
   * transaction of the organization of the context, each with its `space.access-changed.v1` or
   * `list.access-changed.v1` by the system. Grants belonging to a current membership remain.
   * A removed grant is not taken again, so the job asks until `none-left`.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {string} userId - The account of the member who left.
   * @param {string} [memberId] - The removed membership, absent for older queued jobs.
   * @returns {Promise<GrantRemovalBatch>} What the batch did.
   * @throws {Error} When the batch fails: it rolls back alone.
   */
  removeBatch(
    organizationId: string,
    userId: string,
    memberId?: string,
  ): Promise<GrantRemovalBatch>;
  // #endregion
}
