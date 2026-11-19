import { Module } from '@nestjs/common';

import { AccessRequestsModule } from '../access-requests/access-requests.module.js';
import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { memberGrantsProvider } from './composition/providers/adapters/access/member-grants.provider.js';
import { memberAccessRequestsProvider } from './composition/providers/adapters/access-request/member-access-requests.provider.js';
import { taskAssignmentsProvider } from './composition/providers/adapters/assignee/task-assignments.provider.js';
import { cleanUpRemovedMemberHandlerProvider } from './composition/providers/adapters/clean-up/clean-up-removed-member-handler.provider.js';
import { memberEventsHandlerProvider } from './composition/providers/adapters/membership/member-events-handler.provider.js';
import { memberEventsRedeliveryProvider } from './composition/providers/adapters/membership/member-events-redelivery.provider.js';
import { memberEventUnitOfWorkProvider } from './composition/providers/adapters/membership/member-event-unit-of-work.provider.js';
import { membershipCopyProvider } from './composition/providers/adapters/membership/membership-copy.provider.js';
import { privateSpaceHandoverProvider } from './composition/providers/adapters/space/private-space-handover.provider.js';
import { applyMemberEventProvider } from './composition/providers/use-cases/membership/apply-member-event.provider.js';
import { cleanUpRemovedMemberProvider } from './composition/providers/use-cases/membership/clean-up-removed-member.provider.js';

/**
 * Class MemberLifecycleModule
 *
 * @description
 * Composition root of what task-service does when the memberships of organization-service change:
 * the handler of `member.joined.v1`, `member.role-changed.v1` and `member.removed.v1` with their
 * redelivery schedule, the use case that applies each event to the copy of the memberships
 * (`ApplyMembershipChange` of `OrganizationMembersModule`) and, for a removal, enqueues the
 * `task.clean-up-removed-member` job in the same transaction, and the worker of that job
 * (`CleanUpRemovedMemberHandler`), which hands the private spaces of the former member over to the
 * owner (`HandOverPrivateSpaces` of `SpacesModule`), removes their grants (`RemoveMemberGrants` of
 * `SpacesModule`), drops their pending access requests (`DropMemberAccessRequests` of
 * `AccessRequestsModule`), then removes them from the assignees of every task
 * (`UnassignRemovedMember` of `TasksModule`), batch after batch. It orchestrates these modules so
 * that none calls another: `SpacesModule`, `TasksModule` and `AccessRequestsModule` already read the
 * copy, so the copy calling them would close a module cycle. It owns no table, no route and no
 * export.
 */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule, AccessRequestsModule],
  providers: [
    memberEventUnitOfWorkProvider,
    membershipCopyProvider,
    privateSpaceHandoverProvider,
    memberGrantsProvider,
    memberAccessRequestsProvider,
    taskAssignmentsProvider,
    applyMemberEventProvider,
    cleanUpRemovedMemberProvider,
    cleanUpRemovedMemberHandlerProvider,
    memberEventsRedeliveryProvider,
    memberEventsHandlerProvider,
  ],
})
export class MemberLifecycleModule {}
