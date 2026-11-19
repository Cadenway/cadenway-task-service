import type { FactoryProvider } from '@nestjs/common';

import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { FindTaskReferences } from '../../../../application/use-cases/queries/task/find-task-references/find-task-references.use-case.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant findTaskReferencesProvider
 *
 * @description
 * Builds the reading of tasks by their ids for the access-requests module on the tenant unit of
 * work of the module, which joins the transaction of the caller.
 *
 * @type {FactoryProvider<FindTaskReferences>}
 */
export const findTaskReferencesProvider: FactoryProvider<FindTaskReferences> = {
  provide: FindTaskReferences,
  inject: [TASKS_UNIT_OF_WORK],
  useFactory: (unitOfWork: TasksUnitOfWork): FindTaskReferences =>
    new FindTaskReferences(unitOfWork),
};
