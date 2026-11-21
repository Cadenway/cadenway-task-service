import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ApplyGitTaskStatus } from '../../../../application/use-cases/commands/task/apply-git-task-status/apply-git-task-status.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds delegated Git status changes to the current tenant and placement authorities. */
export const applyGitTaskStatusProvider: FactoryProvider<ApplyGitTaskStatus> = {
  provide: ApplyGitTaskStatus,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): ApplyGitTaskStatus => new ApplyGitTaskStatus(unitOfWork, members, spaces),
};
