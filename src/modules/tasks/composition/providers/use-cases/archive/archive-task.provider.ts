import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ArchiveTask } from '../../../../application/use-cases/commands/archive/archive-task/archive-task.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant archiveTaskProvider
 *
 * @description
 * Builds the archive of a task with its live subtasks on the tenant unit of work of the module,
 * the member directory, which reads the role of the actor in the same transaction, and the space
 * directory, which reads the lists.
 *
 * @type {FactoryProvider<ArchiveTask>}
 */
export const archiveTaskProvider: FactoryProvider<ArchiveTask> = {
  provide: ArchiveTask,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): ArchiveTask => new ArchiveTask(unitOfWork, members, spaces),
};
