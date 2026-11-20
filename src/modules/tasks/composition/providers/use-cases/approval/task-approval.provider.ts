import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ChangeTaskApproval } from '../../../../application/use-cases/commands/approval/change-task-approval/change-task-approval.use-case.js';
import { ReadTaskApproval } from '../../../../application/use-cases/queries/approval/read-task-approval/read-task-approval.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Exposes the authorized task transaction to the approval module. */
export const taskApprovalProviders: readonly FactoryProvider[] = [
  ReadTaskApproval,
  ChangeTaskApproval,
].map((UseCase) => ({
  provide: UseCase,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (work: TasksUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) =>
    new UseCase(work, members, spaces),
}));
