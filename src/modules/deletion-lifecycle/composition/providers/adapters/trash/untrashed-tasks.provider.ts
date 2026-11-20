import type { FactoryProvider } from '@nestjs/common';

import { ListUntrashedTaskIds } from '../../../../../tasks/public/trash/list-untrashed-task-ids.js';
import type { UntrashedTasks } from '../../../../application/ports/outbound/tasks/trash/untrashed-tasks.port.js';
import { TasksUntrashedTasks } from '../../../../infrastructure/adapters/tasks/untrashed-tasks.adapter.js';
import { UNTRASHED_TASKS } from '../../../tokens/trash/untrashed-tasks.token.js';

/**
 * Constant untrashedTasksProvider
 *
 * @description
 * Binds the `UntrashedTasks` port to the public operation `ListUntrashedTaskIds` that
 * `TasksModule` exports.
 *
 * @type {FactoryProvider<UntrashedTasks>}
 */
export const untrashedTasksProvider: FactoryProvider<UntrashedTasks> = {
  provide: UNTRASHED_TASKS,
  inject: [ListUntrashedTaskIds],
  useFactory: (listUntrashedTaskIds: ListUntrashedTaskIds): UntrashedTasks =>
    new TasksUntrashedTasks(listUntrashedTaskIds),
};
