import { JobScheduler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import { SCHEDULE_TRASH_PURGE_QUEUE } from '../../../../../../config/job-queues.js';
import { ScheduleTrashPurge } from '../../../../application/use-cases/commands/trash/schedule-trash-purge/schedule-trash-purge.use-case.js';
import { ScheduleTrashPurgeHandler } from '../../../../presentation/jobs/handlers/trash/schedule-trash-purge.handler.js';

/**
 * Constant scheduleTrashPurgeHandlerProvider
 *
 * @description
 * Builds the daily schedule of the purge and its worker on its queue of `src/config/job-queues.ts`,
 * with the scheduler of `JobsRuntimeModule`.
 *
 * @type {FactoryProvider<ScheduleTrashPurgeHandler>}
 */
export const scheduleTrashPurgeHandlerProvider: FactoryProvider<ScheduleTrashPurgeHandler> = {
  provide: ScheduleTrashPurgeHandler,
  inject: [JobWorkerRegistry, JobScheduler, ScheduleTrashPurge],
  useFactory: (
    workers: JobWorkerRegistry,
    scheduler: JobScheduler,
    useCase: ScheduleTrashPurge,
  ): ScheduleTrashPurgeHandler =>
    new ScheduleTrashPurgeHandler(workers, scheduler, useCase, SCHEDULE_TRASH_PURGE_QUEUE),
};
