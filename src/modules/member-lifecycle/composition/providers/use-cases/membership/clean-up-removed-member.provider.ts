import type { FactoryProvider } from '@nestjs/common';

import type { MemberAccessRequests } from '../../../../application/ports/outbound/access-requests/access-request/member-access-requests.port.js';
import type { MemberFavorites } from '../../../../application/ports/outbound/favorites/member/member-favorites.port.js';
import type { MemberGrants } from '../../../../application/ports/outbound/spaces/access/member-grants.port.js';
import type { PrivateSpaceHandover } from '../../../../application/ports/outbound/spaces/space/private-space-handover.port.js';
import type { TaskAssignments } from '../../../../application/ports/outbound/tasks/assignee/task-assignments.port.js';
import { CleanUpRemovedMember } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.use-case.js';
import { MEMBER_GRANTS } from '../../../tokens/access/member-grants.token.js';
import { MEMBER_ACCESS_REQUESTS } from '../../../tokens/access-request/member-access-requests.token.js';
import { TASK_ASSIGNMENTS } from '../../../tokens/assignee/task-assignments.token.js';
import { MEMBER_FAVORITES } from '../../../tokens/favorites/member-favorites.token.js';
import { PRIVATE_SPACE_HANDOVER } from '../../../tokens/space/private-space-handover.token.js';

/**
 * Constant cleanUpRemovedMemberProvider
 *
 * @description
 * Builds the work of the clean-up job of a removed member on the batch handover of the private
 * spaces, the batch removal of the grants, the batch dropping of the access requests and
 * the batch unassignment from the tasks, each batch in a tenant transaction of its own in the
 * organization context of the job.
 *
 * @type {FactoryProvider<CleanUpRemovedMember>}
 */
export const cleanUpRemovedMemberProvider: FactoryProvider<CleanUpRemovedMember> = {
  provide: CleanUpRemovedMember,
  inject: [
    PRIVATE_SPACE_HANDOVER,
    MEMBER_GRANTS,
    MEMBER_ACCESS_REQUESTS,
    TASK_ASSIGNMENTS,
    MEMBER_FAVORITES,
  ],
  useFactory: (
    spaces: PrivateSpaceHandover,
    grants: MemberGrants,
    requests: MemberAccessRequests,
    assignments: TaskAssignments,
    favorites: MemberFavorites,
  ): CleanUpRemovedMember =>
    new CleanUpRemovedMember(spaces, grants, requests, assignments, favorites),
};
