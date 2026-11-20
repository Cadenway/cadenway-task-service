import type { FactoryProvider } from '@nestjs/common';

import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TrashDeletedListTasks } from '../../../../application/use-cases/commands/trash/trash-deleted-list-tasks/trash-deleted-list-tasks.use-case.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant trashDeletedListTasksProvider
 *
 * @description
 * Builds one batch of the move to the trash of the tasks of a deleted list, which the deletion job
 * of deletion-lifecycle runs, on the tenant unit of work of the module (it joins the transaction of
 * the job) and the space directory, which holds and erases the list.
 *
 * @type {FactoryProvider<TrashDeletedListTasks>}
 */
export const trashDeletedListTasksProvider: FactoryProvider<TrashDeletedListTasks> = {
  provide: TrashDeletedListTasks,
  inject: [TASKS_UNIT_OF_WORK, SPACE_DIRECTORY],
  useFactory: (unitOfWork: TasksUnitOfWork, spaces: SpaceDirectory): TrashDeletedListTasks =>
    new TrashDeletedListTasks(unitOfWork, spaces),
};
