import type { FactoryProvider } from '@nestjs/common';

import type { TrashWrites } from '../../../../application/ports/outbound/feature/trash/trash-writes.port.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TrashTask } from '../../../../application/use-cases/commands/trash/trash-task/trash-task.use-case.js';
import { TRASH_WRITES } from '../../../tokens/feature/trash-writes.token.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant trashTaskProvider
 *
 * @description
 * Builds the deletion of a task with its subtasks on the switch of the writes of the trash, the
 * tenant unit of work of the module, the member directory, which reads the role of the actor in
 * the same transaction, and the space directory, which reads the lists.
 *
 * @type {FactoryProvider<TrashTask>}
 */
export const trashTaskProvider: FactoryProvider<TrashTask> = {
  provide: TrashTask,
  inject: [TRASH_WRITES, TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    writes: TrashWrites,
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): TrashTask => new TrashTask(writes, unitOfWork, members, spaces),
};
