import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { UpdateTask } from '../../../../application/use-cases/commands/task/update-task/update-task.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant updateTaskProvider
 *
 * @description
 * Builds the change of a task, its move and its attachment to a parent on the tenant unit of work of the module, the member directory, which reads the
 * role of the actor in the same transaction and the space directory, which reads the lists and hands out the keys.
 *
 * @type {FactoryProvider<UpdateTask>}
 */
export const updateTaskProvider: FactoryProvider<UpdateTask> = {
  provide: UpdateTask,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): UpdateTask => new UpdateTask(unitOfWork, members, spaces),
};
