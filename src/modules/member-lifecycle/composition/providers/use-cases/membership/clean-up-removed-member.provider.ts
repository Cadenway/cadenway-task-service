import type { FactoryProvider } from '@nestjs/common';

import type { PrivateSpaceHandover } from '../../../../application/ports/outbound/spaces/space/private-space-handover.port.js';
import type { TaskAssignments } from '../../../../application/ports/outbound/tasks/assignee/task-assignments.port.js';
import { CleanUpRemovedMember } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.use-case.js';
import { TASK_ASSIGNMENTS } from '../../../tokens/assignee/task-assignments.token.js';
import { PRIVATE_SPACE_HANDOVER } from '../../../tokens/space/private-space-handover.token.js';

/**
 * Constant cleanUpRemovedMemberProvider
 *
 * @description
 * Builds the work of the clean-up job of a removed member on the batch handover of the private
 * spaces and the batch unassignment from the tasks, each batch in a tenant transaction of its own
 * in the organization context of the job.
 *
 * @type {FactoryProvider<CleanUpRemovedMember>}
 */
export const cleanUpRemovedMemberProvider: FactoryProvider<CleanUpRemovedMember> = {
  provide: CleanUpRemovedMember,
  inject: [PRIVATE_SPACE_HANDOVER, TASK_ASSIGNMENTS],
  useFactory: (spaces: PrivateSpaceHandover, assignments: TaskAssignments): CleanUpRemovedMember =>
    new CleanUpRemovedMember(spaces, assignments),
};
