import { JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import { DROP_TRASHED_TASK_REQUESTS_QUEUE } from '../../../../../../config/job-queues.js';
import { DropTrashedTaskRequests } from '../../../../application/use-cases/commands/trash/drop-trashed-task-requests/drop-trashed-task-requests.use-case.js';
import { DropTrashedTaskRequestsHandler } from '../../../../presentation/jobs/handlers/trash/drop-trashed-task-requests.handler.js';

/**
 * Constant dropTrashedTaskRequestsHandlerProvider
 *
 * @description
 * Builds the worker of the jobs of the requests of a trash entry on its queue of
 * `src/config/job-queues.ts`.
 *
 * @type {FactoryProvider<DropTrashedTaskRequestsHandler>}
 */
export const dropTrashedTaskRequestsHandlerProvider: FactoryProvider<DropTrashedTaskRequestsHandler> =
  {
    provide: DropTrashedTaskRequestsHandler,
    inject: [JobWorkerRegistry, DropTrashedTaskRequests],
    useFactory: (
      workers: JobWorkerRegistry,
      useCase: DropTrashedTaskRequests,
    ): DropTrashedTaskRequestsHandler =>
      new DropTrashedTaskRequestsHandler(workers, useCase, DROP_TRASHED_TASK_REQUESTS_QUEUE),
  };
