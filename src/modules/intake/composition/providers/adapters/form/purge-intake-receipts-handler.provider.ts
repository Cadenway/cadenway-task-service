import { JobScheduler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import { PURGE_INTAKE_RECEIPTS_QUEUE } from '../../../../../../config/job-queues.js';
import { PurgeExpiredIntakeReceipts } from '../../../../application/use-cases/commands/form/purge-expired-intake-receipts/purge-expired-intake-receipts.use-case.js';
import { PurgeIntakeReceiptsHandler } from '../../../../presentation/jobs/handlers/form/purge-intake-receipts.handler.js';

/** Registers the cleanup worker on its provisioned queue. */
export const purgeIntakeReceiptsHandlerProvider: FactoryProvider<PurgeIntakeReceiptsHandler> = {
  provide: PurgeIntakeReceiptsHandler,
  inject: [JobWorkerRegistry, JobScheduler, PurgeExpiredIntakeReceipts],
  useFactory: (
    workers: JobWorkerRegistry,
    scheduler: JobScheduler,
    purge: PurgeExpiredIntakeReceipts,
  ): PurgeIntakeReceiptsHandler =>
    new PurgeIntakeReceiptsHandler(workers, scheduler, purge, PURGE_INTAKE_RECEIPTS_QUEUE),
};
