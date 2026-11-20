import type { Job, JobScheduler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { PurgeExpiredIntakeReceipts } from '../../../../application/use-cases/commands/form/purge-expired-intake-receipts/purge-expired-intake-receipts.use-case.js';

/** Registers the durable system job for cleaning up expired intake receipts. */
export class PurgeIntakeReceiptsHandler implements OnApplicationBootstrap {
  // #region Properties
  /** Reports counts without reading receipt data. */
  private readonly logger = new Logger(PurgeIntakeReceiptsHandler.name);
  // #endregion

  // #region Constructor
  /** Binds the queue and its cleanup operation. */
  public constructor(
    private readonly workers: JobWorkerRegistry,
    private readonly scheduler: JobScheduler,
    private readonly purge: PurgeExpiredIntakeReceipts,
    private readonly queue: string,
  ) {}
  // #endregion

  // #region Methods
  /** Registers the same schedule on each replica and starts consuming its occurrences. */
  public async onApplicationBootstrap(): Promise<void> {
    await this.scheduler.schedule(this.queue, '* * * * *', { key: 'minutely', timeZone: 'UTC' });
    await this.workers.work(this.queue, (job: Job) => this.handle(job));
  }

  /** Cleans expired receipts for all organizations, only for a system job. */
  public async handle(job: Job): Promise<void> {
    if (job.organizationId !== null)
      throw new Error('Intake receipt cleanup requires a system job.');
    const purged = await this.purge.execute(job.signal);
    if (purged > 0) this.logger.log({ jobId: job.id, purged }, 'Expired intake receipts removed');
  }
  // #endregion
}
