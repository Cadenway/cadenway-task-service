import type { FactoryProvider } from '@nestjs/common';

import { ApplyMembershipChange } from '../../../../../organization-members/public/membership/apply-membership-change.js';
import type { MembershipCopy } from '../../../../application/ports/outbound/members/membership/membership-copy.port.js';
import { OrganizationMembersMembershipCopy } from '../../../../infrastructure/adapters/organization-members/membership-copy.adapter.js';
import { MEMBERSHIP_COPY } from '../../../tokens/membership/membership-copy.token.js';

/**
 * Constant membershipCopyProvider
 *
 * @description
 * Binds the `MembershipCopy` port to `ApplyMembershipChange`, which `OrganizationMembersModule`
 * exports.
 *
 * @type {FactoryProvider<MembershipCopy>}
 */
export const membershipCopyProvider: FactoryProvider<MembershipCopy> = {
  provide: MEMBERSHIP_COPY,
  inject: [ApplyMembershipChange],
  useFactory: (applyMembershipChange: ApplyMembershipChange): MembershipCopy =>
    new OrganizationMembersMembershipCopy(applyMembershipChange),
};
