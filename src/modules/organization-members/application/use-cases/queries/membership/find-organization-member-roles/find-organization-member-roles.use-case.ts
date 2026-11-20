import type { Membership } from '../../../../../domain/aggregates/membership/membership.aggregate.js';
import { leastPrivilegedMembership } from '../../../../../domain/policies/membership/least-privileged-membership.policy.js';
import type { MembershipRepository } from '../../../../ports/outbound/persistence/membership/membership-repository.port.js';
import type { MembershipsUnitOfWork } from '../../../../ports/outbound/transactions/membership/memberships-unit-of-work.port.js';
import type { FindOrganizationMemberRolesInput } from './find-organization-member-roles.input.js';
import type { FindOrganizationMemberRolesOutput } from './find-organization-member-roles.output.js';

/** Resolves a batch of active member roles, optionally holding the memberships for a write. */
export class FindOrganizationMemberRoles {
  // #region Constructor
  /** Uses the tenant transaction of the caller. */
  public constructor(private readonly unitOfWork: MembershipsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Reads the current role of each distinct requested user. */
  public async execute(
    input: FindOrganizationMemberRolesInput,
  ): Promise<readonly FindOrganizationMemberRolesOutput[]> {
    const userIds: readonly string[] = [...new Set(input.userIds)];
    if (userIds.length === 0) {
      return [];
    }
    const active: readonly Membership[] = await this.unitOfWork.run(
      (memberships: MembershipRepository): Promise<Membership[]> =>
        memberships.listActiveByUsers(input.organizationId, userIds, input.lock),
    );
    const byUser = new Map<string, Membership[]>();
    for (const membership of active) {
      const userId: string = membership.snapshot.userId;
      const group: Membership[] = byUser.get(userId) ?? [];
      group.push(membership);
      byUser.set(userId, group);
    }
    return userIds.map((userId: string): FindOrganizationMemberRolesOutput => ({
      userId,
      role: leastPrivilegedMembership(byUser.get(userId) ?? [])?.snapshot.role ?? null,
    }));
  }
  // #endregion
}
