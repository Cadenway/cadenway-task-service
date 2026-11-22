import type { FactoryProvider } from '@nestjs/common';

import { ReadCurrentMembership } from '../../../../../organization-members/public/membership/read-current-membership.js';
import type { MembershipProjection } from '../../../../application/ports/outbound/members/membership/membership-projection.port.js';
import { DelegatedMemberships } from '../../../../application/use-cases/queries/member/delegated-memberships/delegated-memberships.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';

/** Issues current membership proofs with Task's own signing identity. */
export const delegatedMembershipsProvider: FactoryProvider<DelegatedMemberships> = {
  provide: DelegatedMemberships,
  inject: [ReadCurrentMembership, MEMBER_DIRECTORY],
  useFactory: (authority: ReadCurrentMembership, projection: MembershipProjection) =>
    new DelegatedMemberships(
      { find: (organizationId, userId) => authority.execute(organizationId, userId) },
      projection,
    ),
};
