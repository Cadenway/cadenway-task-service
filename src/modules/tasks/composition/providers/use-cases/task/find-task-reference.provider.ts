import type { FactoryProvider } from '@nestjs/common';

import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { FindTaskReference } from '../../../../application/use-cases/queries/task/find-task-reference/find-task-reference.use-case.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant findTaskReferenceProvider
 *
 * @description
 * Builds the reading of a task by its key for the access-requests module on the tenant unit of
 * work of the module, which joins the transaction of the caller.
 *
 * @type {FactoryProvider<FindTaskReference>}
 */
export const findTaskReferenceProvider: FactoryProvider<FindTaskReference> = {
  provide: FindTaskReference,
  inject: [TASKS_UNIT_OF_WORK],
  useFactory: (unitOfWork: TasksUnitOfWork): FindTaskReference => new FindTaskReference(unitOfWork),
};
