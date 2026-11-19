import { JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import { PURGE_TRASH_QUEUE } from '../../../../../../config/job-queues.js';
import { PurgeTrash } from '../../../../application/use-cases/commands/trash/purge-trash/purge-trash.use-case.js';
import { PurgeTrashHandler } from '../../../../presentation/jobs/handlers/trash/purge-trash.handler.js';

/**
 * Constant purgeTrashHandlerProvider
 *
 * @description
 * Builds the worker of the purge jobs on its queue of `src/config/job-queues.ts`.
 *
 * @type {FactoryProvider<PurgeTrashHandler>}
 */
export const purgeTrashHandlerProvider: FactoryProvider<PurgeTrashHandler> = {
  provide: PurgeTrashHandler,
  inject: [JobWorkerRegistry, PurgeTrash],
  useFactory: (workers: JobWorkerRegistry, useCase: PurgeTrash): PurgeTrashHandler =>
    new PurgeTrashHandler(workers, useCase, PURGE_TRASH_QUEUE),
};
