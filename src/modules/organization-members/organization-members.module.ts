import { Module } from '@nestjs/common';

import { tenantUnitOfWorkProvider } from './composition/providers/adapters/membership/tenant-unit-of-work.provider.js';
import { applyMembershipChangeProvider } from './composition/providers/use-cases/membership/apply-membership-change.provider.js';
import { findOrganizationMemberProvider } from './composition/providers/use-cases/membership/find-organization-member.provider.js';
import { findOrganizationMemberRolesProvider } from './composition/providers/use-cases/membership/find-organization-member-roles.provider.js';
import { findOrganizationOwnerProvider } from './composition/providers/use-cases/membership/find-organization-owner.provider.js';
import { ApplyMembershipChange } from './public/membership/apply-membership-change.js';
import { FindOrganizationMember } from './public/membership/find-organization-member.js';
import { FindOrganizationMemberRoles } from './public/membership/find-organization-member-roles.js';
import { FindOrganizationOwner } from './public/membership/find-organization-owner.js';

/**
 * Class OrganizationMembersModule
 *
 * @description
 * Composition root of the copy of the memberships of organization-service, the source of the
 * members and roles of this service (decision 4 of the P3a plan, never the `role` claim of the
 * internal token). It subscribes to no event itself: `MemberLifecycleModule` consumes the three
 * member events and applies each with `ApplyMembershipChange`, then drives the other modules a
 * removal concerns, which this module cannot call without a module cycle. It exports its
 * public operations (`public/membership/`): `ApplyMembershipChange`, `FindOrganizationMember`,
 * `FindOrganizationMemberRoles` and `FindOrganizationOwner`. They join the tenant transaction
 * of their caller.
 */
@Module({
  providers: [
    tenantUnitOfWorkProvider,
    applyMembershipChangeProvider,
    findOrganizationMemberProvider,
    findOrganizationMemberRolesProvider,
    findOrganizationOwnerProvider,
  ],
  exports: [
    ApplyMembershipChange,
    FindOrganizationMember,
    FindOrganizationMemberRoles,
    FindOrganizationOwner,
  ],
})
export class OrganizationMembersModule {}
