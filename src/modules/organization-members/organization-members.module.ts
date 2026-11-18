import { Module } from '@nestjs/common';

import { memberEventsHandlerProvider } from './composition/providers/adapters/membership/member-events-handler.provider.js';
import { memberEventsRedeliveryProvider } from './composition/providers/adapters/membership/member-events-redelivery.provider.js';
import { tenantUnitOfWorkProvider } from './composition/providers/adapters/membership/tenant-unit-of-work.provider.js';
import { applyMembershipChangeProvider } from './composition/providers/use-cases/membership/apply-membership-change.provider.js';
import { findOrganizationMemberProvider } from './composition/providers/use-cases/membership/find-organization-member.provider.js';
import { findOrganizationOwnerProvider } from './composition/providers/use-cases/membership/find-organization-owner.provider.js';

/**
 * Class OrganizationMembersModule
 *
 * @description
 * Composition root of the copy of the memberships of organization-service, the source of the
 * members and roles of this service (decision 4 of the P3a plan, never the `role` claim of the
 * internal token): the handler of the three member events with their redelivery schedule, and the
 * two readings the modules of P3a will consume, `FindOrganizationMember` and
 * `FindOrganizationOwner`. They export nothing yet: the strict architecture check admits a public
 * entry and a Nest export only with an existing consuming module, so the change that adds the
 * first consumer adds its `public/membership/<operation>` entry, its row in `MODULE.md` and the
 * export.
 */
@Module({
  providers: [
    tenantUnitOfWorkProvider,
    applyMembershipChangeProvider,
    findOrganizationMemberProvider,
    findOrganizationOwnerProvider,
    memberEventsRedeliveryProvider,
    memberEventsHandlerProvider,
  ],
})
export class OrganizationMembersModule {}
