import { Module } from '@nestjs/common';

import { tenantUnitOfWorkProvider } from './composition/providers/adapters/membership/tenant-unit-of-work.provider.js';
import { applyMembershipChangeProvider } from './composition/providers/use-cases/membership/apply-membership-change.provider.js';
import { findOrganizationMemberProvider } from './composition/providers/use-cases/membership/find-organization-member.provider.js';
import { findOrganizationOwnerProvider } from './composition/providers/use-cases/membership/find-organization-owner.provider.js';
import { ApplyMembershipChange } from './public/membership/apply-membership-change.js';
import { FindOrganizationMember } from './public/membership/find-organization-member.js';
import { FindOrganizationOwner } from './public/membership/find-organization-owner.js';

/**
 * Class OrganizationMembersModule
 *
 * @description
 * Composition root of the copy of the memberships of organization-service, the source of the
 * members and roles of this service (decision 4 of the P3a plan, never the `role` claim of the
 * internal token). It subscribes to no event itself: `MemberLifecycleModule` consumes the three
 * member events and applies each with `ApplyMembershipChange`, then drives the other modules a
 * removal concerns, which this module cannot call without a module cycle. It exports its three
 * public operations (`public/membership/`): `ApplyMembershipChange`, and the two readings the other
 * modules bind their own ports to, `FindOrganizationMember` and `FindOrganizationOwner`. All three
 * join the tenant transaction of their caller.
 */
@Module({
  providers: [
    tenantUnitOfWorkProvider,
    applyMembershipChangeProvider,
    findOrganizationMemberProvider,
    findOrganizationOwnerProvider,
  ],
  exports: [ApplyMembershipChange, FindOrganizationMember, FindOrganizationOwner],
})
export class OrganizationMembersModule {}
