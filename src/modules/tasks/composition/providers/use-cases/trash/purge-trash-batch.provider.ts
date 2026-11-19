import type { FactoryProvider } from '@nestjs/common';

import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { PurgeTrashBatch } from '../../../../application/use-cases/commands/trash/purge-trash-batch/purge-trash-batch.use-case.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant purgeTrashBatchProvider
 *
 * @description
 * Builds one batch of the erasure of the trash of an organization, which the purge job of
 * deletion-lifecycle runs, on the tenant unit of work of the module (it joins the transaction of
 * the job) and the space directory, which erases the tombstones left without a task.
 *
 * @type {FactoryProvider<PurgeTrashBatch>}
 */
export const purgeTrashBatchProvider: FactoryProvider<PurgeTrashBatch> = {
  provide: PurgeTrashBatch,
  inject: [TASKS_UNIT_OF_WORK, SPACE_DIRECTORY],
  useFactory: (unitOfWork: TasksUnitOfWork, spaces: SpaceDirectory): PurgeTrashBatch =>
    new PurgeTrashBatch(unitOfWork, spaces),
};
