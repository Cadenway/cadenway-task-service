import { SystemTransactionRunner } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { tenantUnitOfWorkProvider } from './composition/providers/adapters/membership/tenant-unit-of-work.provider.js';
import { applyMembershipChangeProvider } from './composition/providers/use-cases/membership/apply-membership-change.provider.js';
import { findOrganizationMemberProvider } from './composition/providers/use-cases/membership/find-organization-member.provider.js';
import { findOrganizationMemberRolesProvider } from './composition/providers/use-cases/membership/find-organization-member-roles.provider.js';
import { findOrganizationOwnerProvider } from './composition/providers/use-cases/membership/find-organization-owner.provider.js';
import { listActiveMembersProvider } from './composition/providers/use-cases/membership/list-active-members.provider.js';
import { readCurrentMembershipProvider } from './composition/providers/use-cases/membership/read-current-membership.provider.js';
import { DrizzleRebuildMembershipScan } from './infrastructure/persistence/drizzle/repositories/membership/drizzle-rebuild-membership-scan.repository.js';
import { ApplyMembershipChange } from './public/membership/apply-membership-change.js';
import { FindOrganizationMember } from './public/membership/find-organization-member.js';
import { FindOrganizationMemberRoles } from './public/membership/find-organization-member-roles.js';
import { FindOrganizationOwner } from './public/membership/find-organization-owner.js';
import { ListActiveMembers } from './public/membership/list-active-members.js';
import { ReadCurrentMembership } from './public/membership/read-current-membership.js';
import { ScanMembershipRebuild } from './public/membership/scan-membership-rebuild.js';

/**
 * Class OrganizationMembersModule
 *
 * @description
 * Composition root of the copy of the memberships of organization-service, the source of the
 * members and roles of this service (decision 4 of the P3a plan, never the `role` claim of the
 * internal token). It subscribes to no event itself: `MemberLifecycleModule` consumes the three
 * member events and applies each with `ApplyMembershipChange`, then drives the other modules a
 * removal concerns, which this module cannot call without a module cycle. Its public operations
 * join the tenant transaction of their caller.
 */
@Module({
  providers: [
    tenantUnitOfWorkProvider,
    applyMembershipChangeProvider,
    findOrganizationMemberProvider,
    findOrganizationMemberRolesProvider,
    findOrganizationOwnerProvider,
    listActiveMembersProvider,
    readCurrentMembershipProvider,
    {
      provide: ScanMembershipRebuild,
      inject: [SystemTransactionRunner],
      useFactory: (system: SystemTransactionRunner): ScanMembershipRebuild => {
        const scan = new DrizzleRebuildMembershipScan(system);
        return new ScanMembershipRebuild((check) => scan.verify(check));
      },
    },
  ],
  exports: [
    ApplyMembershipChange,
    FindOrganizationMember,
    FindOrganizationMemberRoles,
    FindOrganizationOwner,
    ListActiveMembers,
    ReadCurrentMembership,
    ScanMembershipRebuild,
  ],
})
export class OrganizationMembersModule {}
