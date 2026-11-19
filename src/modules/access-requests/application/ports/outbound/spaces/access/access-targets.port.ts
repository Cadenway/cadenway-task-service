import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { GrantOutcome } from '../../../../models/grant/grant-outcome.model.js';
import type { GrantRequest } from '../../../../models/grant/grant-request.model.js';
import type { ManagedTargets } from '../../../../models/target/managed-targets.model.js';
import type { TargetAccess } from '../../../../models/target/target-access.model.js';
import type { TargetRef } from '../../../../models/target/target-ref.model.js';

/**
 * Interface AccessTargets
 *
 * @description
 * What the access-requests module asks the spaces module, which owns the spaces, the lists, the
 * access rules and the grants. Every call joins the tenant transaction of the use case.
 */
export interface AccessTargets {
  // #region Methods
  /**
   * Method find
   *
   * @description
   * Reads a space or a list of the organization with the access of a member on it, without lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {MemberRole} viewerRole - Its role in the organization, from the copy of the
   * memberships.
   * @param {TargetRef} target - The space or the list.
   * @returns {Promise<TargetAccess | null>} The target, or `null` when the organization has no such
   * space or list.
   */
  find(
    organizationId: string,
    viewerUserId: string,
    viewerRole: MemberRole,
    target: TargetRef,
  ): Promise<TargetAccess | null>;

  /**
   * Method listManaged
   *
   * @description
   * Lists what a member answers access requests for: the spaces they manage and the lists they have
   * `edit` on.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {MemberRole} viewerRole - Its role in the organization.
   * @returns {Promise<ManagedTargets>} The spaces and the lists.
   */
  listManaged(
    organizationId: string,
    viewerUserId: string,
    viewerRole: MemberRole,
  ): Promise<ManagedTargets>;

  /**
   * Method grant
   *
   * @description
   * Gives the requester the grant of an approval, or raises a lower one, and keeps an equal or
   * higher one; a change bumps the version of the space or the list and appends its
   * `space.access-changed.v1` or `list.access-changed.v1`, in the transaction of the approval. The
   * spaces module checks again, on the locked rows, that the actor manages the target.
   *
   * @param {GrantRequest} request - The grant.
   * @returns {Promise<GrantOutcome>} What was done, or the rule that refused it.
   */
  grant(request: GrantRequest): Promise<GrantOutcome>;
  // #endregion
}
