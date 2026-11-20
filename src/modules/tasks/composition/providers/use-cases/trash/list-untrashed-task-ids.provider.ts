import type { FactoryProvider } from '@nestjs/common';

import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ListUntrashedTaskIds } from '../../../../application/use-cases/queries/trash/list-untrashed-task-ids/list-untrashed-task-ids.use-case.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant listUntrashedTaskIdsProvider
 *
 * @description
 * Builds the read of the tasks out of the trash among some ids, which the job that drops the
 * requests of a trash entry (deletion-lifecycle) runs, on the tenant unit of work of the module
 * (it joins the transaction of the job).
 *
 * @type {FactoryProvider<ListUntrashedTaskIds>}
 */
export const listUntrashedTaskIdsProvider: FactoryProvider<ListUntrashedTaskIds> = {
  provide: ListUntrashedTaskIds,
  inject: [TASKS_UNIT_OF_WORK],
  useFactory: (unitOfWork: TasksUnitOfWork): ListUntrashedTaskIds =>
    new ListUntrashedTaskIds(unitOfWork),
};
