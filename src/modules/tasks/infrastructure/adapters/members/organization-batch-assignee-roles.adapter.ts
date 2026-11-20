import type { FindOrganizationMemberRoles } from '../../../../organization-members/public/membership/find-organization-member-roles.js';
import type { BatchAssigneeRoles } from '../../../application/ports/outbound/members/membership/batch-assignee-roles.port.js';
import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';

/** Joins the caller's transaction to the organization membership projection. */
export class OrganizationBatchAssigneeRoles implements BatchAssigneeRoles {
  // #region Constructor
  /** Takes the member projection's batch operation. */
  public constructor(private readonly findRoles: FindOrganizationMemberRoles) {}
  // #endregion

  // #region Methods
  /** Resolves and holds the assigned memberships. */
  public async hold(
    organizationId: string,
    userIds: readonly string[],
  ): Promise<readonly AssigneeCandidate[]> {
    return this.findRoles.execute({ organizationId, userIds, lock: true });
  }
  // #endregion
}
