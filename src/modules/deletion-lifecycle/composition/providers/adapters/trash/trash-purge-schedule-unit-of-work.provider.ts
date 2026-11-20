import { SystemTransactionRunner } from '@cadenway/nest-common/database';
import { JobProducer } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import type { TrashPurgeScheduleUnitOfWork } from '../../../../application/ports/outbound/transactions/trash/trash-purge-schedule-unit-of-work.port.js';
import { SystemTrashPurgeScheduleUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/trash/system-trash-purge-schedule.unit-of-work.js';
import { TRASH_PURGE_SCHEDULE_UNIT_OF_WORK } from '../../../tokens/trash/trash-purge-schedule-unit-of-work.token.js';

/**
 * Constant trashPurgeScheduleUnitOfWorkProvider
 *
 * @description
 * Binds the unit of work of the daily schedule to the system runner of the kit, with the job
 * producer of `JobsRuntimeModule`, which enqueues the purge jobs through each system transaction.
 *
 * @type {FactoryProvider<TrashPurgeScheduleUnitOfWork>}
 */
export const trashPurgeScheduleUnitOfWorkProvider: FactoryProvider<TrashPurgeScheduleUnitOfWork> = {
  provide: TRASH_PURGE_SCHEDULE_UNIT_OF_WORK,
  inject: [SystemTransactionRunner, JobProducer],
  useFactory: (runner: SystemTransactionRunner, jobs: JobProducer): TrashPurgeScheduleUnitOfWork =>
    new SystemTrashPurgeScheduleUnitOfWork(runner, jobs),
};
