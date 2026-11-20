import type { Job, JobScheduler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { OnApplicationBootstrap } from '@nestjs/common';

import type { ExpireIntakeAttachmentDrafts } from '../../../../application/use-cases/commands/attachment/expire-intake-attachment-drafts/expire-intake-attachment-drafts.use-case.js';

/** Starts the durable system sweep for expired anonymous upload drafts. */
export class ExpireIntakeAttachmentDraftsHandler implements OnApplicationBootstrap {
  // #region Constructor
  /** Binds the provisioned queue and cleanup operation. */
  public constructor(
    private readonly workers: JobWorkerRegistry,
    private readonly scheduler: JobScheduler,
    private readonly expire: ExpireIntakeAttachmentDrafts,
    private readonly queue: string,
  ) {}
  // #endregion

  // #region Methods
  /** Schedules the sweep once per UTC minute. */
  public async onApplicationBootstrap(): Promise<void> {
    await this.scheduler.schedule(this.queue, '* * * * *', { key: 'minutely', timeZone: 'UTC' });
    await this.workers.work(this.queue, (job: Job) => this.handle(job));
  }

  /** Runs only as a system job, using its cancellation signal. */
  public async handle(job: Job): Promise<void> {
    if (job.organizationId !== null) throw new Error('Intake draft cleanup requires a system job.');
    await this.expire.execute(job.signal);
  }
  // #endregion
}
