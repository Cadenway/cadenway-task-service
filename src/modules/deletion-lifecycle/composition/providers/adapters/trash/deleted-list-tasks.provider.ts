import type { FactoryProvider } from '@nestjs/common';

import { TrashDeletedListTasks } from '../../../../../tasks/public/trash/trash-deleted-list-tasks.js';
import type { DeletedListTasks } from '../../../../application/ports/outbound/tasks/trash/deleted-list-tasks.port.js';
import { TasksDeletedListTasks } from '../../../../infrastructure/adapters/tasks/deleted-list-tasks.adapter.js';
import { DELETED_LIST_TASKS } from '../../../tokens/trash/deleted-list-tasks.token.js';

/**
 * Constant deletedListTasksProvider
 *
 * @description
 * Binds the `DeletedListTasks` port to the public operation `TrashDeletedListTasks` that
 * `TasksModule` exports.
 *
 * @type {FactoryProvider<DeletedListTasks>}
 */
export const deletedListTasksProvider: FactoryProvider<DeletedListTasks> = {
  provide: DELETED_LIST_TASKS,
  inject: [TrashDeletedListTasks],
  useFactory: (trashDeletedListTasks: TrashDeletedListTasks): DeletedListTasks =>
    new TasksDeletedListTasks(trashDeletedListTasks),
};
