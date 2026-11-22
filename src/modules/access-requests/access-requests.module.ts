import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { accessTargetsProvider } from './composition/providers/adapters/access/access-targets.provider.js';
import { accessRequestsUnitOfWorkProvider } from './composition/providers/adapters/access-request/access-requests-unit-of-work.provider.js';
import { currentMembershipProvider } from './composition/providers/adapters/membership/current-membership.provider.js';
import { memberDirectoryProvider } from './composition/providers/adapters/membership/member-directory.provider.js';
import { taskReferencesProvider } from './composition/providers/adapters/task/task-references.provider.js';
import { approveAccessRequestProvider } from './composition/providers/use-cases/access-request/approve-access-request.provider.js';
import { createAccessRequestProvider } from './composition/providers/use-cases/access-request/create-access-request.provider.js';
import { dropMemberAccessRequestsProvider } from './composition/providers/use-cases/access-request/drop-member-access-requests.provider.js';
import { dropTargetAccessRequestsProvider } from './composition/providers/use-cases/access-request/drop-target-access-requests.provider.js';
import { listAccessRequestsProvider } from './composition/providers/use-cases/access-request/list-access-requests.provider.js';
import { refuseAccessRequestProvider } from './composition/providers/use-cases/access-request/refuse-access-request.provider.js';
import { AccessRequestsController } from './presentation/http/controllers/access-request/access-requests.controller.js';
import { DropMemberAccessRequests } from './public/access-request/drop-member-access-requests.js';
import { DropTargetAccessRequests } from './public/access-request/drop-target-access-requests.js';

/**
 * Class AccessRequestsModule
 *
 * @description
 * Composition root of the requests for access to spaces, lists and tasks ("Demander l’accès",
 * decision 4 of P3b-1): the routes of `/internal/v1/access-requests`, the use cases on one tenant
 * unit of work that appends their events to the outbox in the same transaction, and the ports to
 * the copy of the memberships (`OrganizationMembersModule`), the spaces, lists and grants
 * (`SpacesModule`) and the tasks (`TasksModule`). A module of its own: it depends on spaces and
 * tasks, and neither may depend on it. It exports `DropMemberAccessRequests`, which the clean-up
 * job of the member-lifecycle module runs batch after batch once a member left the organization,
 * and `DropTargetAccessRequests`, which the jobs of the deletion-lifecycle module run in their
 * transactions to drop the pending requests of the deleted lists and spaces and of the tasks moved
 * to the trash.
 */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule],
  controllers: [AccessRequestsController],
  providers: [
    accessRequestsUnitOfWorkProvider,
    currentMembershipProvider,
    memberDirectoryProvider,
    accessTargetsProvider,
    taskReferencesProvider,
    createAccessRequestProvider,
    listAccessRequestsProvider,
    approveAccessRequestProvider,
    refuseAccessRequestProvider,
    dropMemberAccessRequestsProvider,
    dropTargetAccessRequestsProvider,
  ],
  exports: [DropMemberAccessRequests, DropTargetAccessRequests],
})
export class AccessRequestsModule {}
