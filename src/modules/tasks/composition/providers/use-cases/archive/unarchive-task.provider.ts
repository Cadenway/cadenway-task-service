import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { UnarchiveTask } from '../../../../application/use-cases/commands/archive/unarchive-task/unarchive-task.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant unarchiveTaskProvider
 *
 * @description
 * Builds the restoration of the archive of a task on the tenant unit of work of the module, the
 * member directory, which reads the role of the actor in the same transaction, and the space
 * directory, which reads the lists and restores an archived list.
 *
 * @type {FactoryProvider<UnarchiveTask>}
 */
export const unarchiveTaskProvider: FactoryProvider<UnarchiveTask> = {
  provide: UnarchiveTask,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): UnarchiveTask => new UnarchiveTask(unitOfWork, members, spaces),
};
