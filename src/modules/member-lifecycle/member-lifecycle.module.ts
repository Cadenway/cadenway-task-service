import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { taskAssignmentsProvider } from './composition/providers/adapters/assignee/task-assignments.provider.js';
import { memberEventsHandlerProvider } from './composition/providers/adapters/membership/member-events-handler.provider.js';
import { memberEventsRedeliveryProvider } from './composition/providers/adapters/membership/member-events-redelivery.provider.js';
import { memberEventUnitOfWorkProvider } from './composition/providers/adapters/membership/member-event-unit-of-work.provider.js';
import { membershipCopyProvider } from './composition/providers/adapters/membership/membership-copy.provider.js';
import { privateSpaceHandoverProvider } from './composition/providers/adapters/space/private-space-handover.provider.js';
import { applyMemberEventProvider } from './composition/providers/use-cases/membership/apply-member-event.provider.js';

/**
 * Class MemberLifecycleModule
 *
 * @description
 * Composition root of what task-service does when the memberships of organization-service change:
 * the handler of `member.joined.v1`, `member.role-changed.v1` and `member.removed.v1` with their
 * redelivery schedule, and the use case that applies each event to the copy of the memberships
 * (`ApplyMembershipChange` of `OrganizationMembersModule`) and, for a removal, hands the private
 * spaces of the former member over to the owner (`HandOverPrivateSpaces` of `SpacesModule`) and
 * removes them from the assignees of every task (`UnassignRemovedMember` of `TasksModule`). It
 * orchestrates these modules so that none calls another: `SpacesModule` and `TasksModule` already
 * read the copy, so the copy calling them would close a module cycle. It owns no table, no route and
 * no export.
 */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule],
  providers: [
    memberEventUnitOfWorkProvider,
    membershipCopyProvider,
    privateSpaceHandoverProvider,
    taskAssignmentsProvider,
    applyMemberEventProvider,
    memberEventsRedeliveryProvider,
    memberEventsHandlerProvider,
  ],
})
export class MemberLifecycleModule {}
