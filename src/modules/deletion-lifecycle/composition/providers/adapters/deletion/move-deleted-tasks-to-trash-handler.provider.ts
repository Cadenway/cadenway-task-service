import { JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import { TRASH_DELETED_TASKS_QUEUE } from '../../../../../../config/job-queues.js';
import { MoveDeletedTasksToTrash } from '../../../../application/use-cases/commands/deletion/move-deleted-tasks-to-trash/move-deleted-tasks-to-trash.use-case.js';
import { MoveDeletedTasksToTrashHandler } from '../../../../presentation/jobs/handlers/deletion/move-deleted-tasks-to-trash.handler.js';

/**
 * Constant moveDeletedTasksToTrashHandlerProvider
 *
 * @description
 * Builds the worker of the deletion jobs on its queue of `src/config/job-queues.ts`.
 *
 * @type {FactoryProvider<MoveDeletedTasksToTrashHandler>}
 */
export const moveDeletedTasksToTrashHandlerProvider: FactoryProvider<MoveDeletedTasksToTrashHandler> =
  {
    provide: MoveDeletedTasksToTrashHandler,
    inject: [JobWorkerRegistry, MoveDeletedTasksToTrash],
    useFactory: (
      workers: JobWorkerRegistry,
      useCase: MoveDeletedTasksToTrash,
    ): MoveDeletedTasksToTrashHandler =>
      new MoveDeletedTasksToTrashHandler(workers, useCase, TRASH_DELETED_TASKS_QUEUE),
  };
