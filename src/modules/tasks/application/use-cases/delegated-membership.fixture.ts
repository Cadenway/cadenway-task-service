import type { MembershipStamp } from '../models/membership/membership-stamp.model.js';
import type { MemberDirectory } from '../ports/outbound/members/membership/member-directory.port.js';
import type { MembershipAuthority } from '../ports/outbound/members/membership/membership-authority.port.js';
import type { MembershipProjection } from '../ports/outbound/members/membership/membership-projection.port.js';
import { DelegatedMemberships } from './queries/member/delegated-memberships/delegated-memberships.use-case.js';
import { atelierNordMembers } from './tasks.fixture.js';

/** Uses independent test doubles for Organization and the Task projection. */
export function delegatedMembershipFixture(
  projected: MemberDirectory,
  active: MemberDirectory = atelierNordMembers(),
): {
  readonly authority: MembershipAuthority;
  readonly projection: MembershipProjection;
  readonly memberships: DelegatedMemberships;
} {
  const stamp = async (
    members: MemberDirectory,
    organizationId: string,
    userId: string,
    lock?: boolean,
  ): Promise<MembershipStamp | null> => {
    const role = await members.roleOf(organizationId, userId, lock);
    return role === null ? null : { memberId: userId, role, version: 1 };
  };
  const authority = {
    find: (organizationId: string, userId: string) => stamp(active, organizationId, userId),
  };
  const projection = {
    stampOf: (organizationId: string, userId: string, lock: boolean) =>
      stamp(projected, organizationId, userId, lock),
  };
  return { authority, projection, memberships: new DelegatedMemberships(authority, projection) };
}
