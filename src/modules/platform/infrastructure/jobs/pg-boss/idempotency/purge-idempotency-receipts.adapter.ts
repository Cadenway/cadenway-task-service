import { idempotencyKeys, SystemTransactionRunner } from '@cadenway/nest-common/database';
import { JobScheduler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { Job } from '@cadenway/nest-jobs/runtime';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { PURGE_IDEMPOTENCY_RECEIPTS_QUEUE } from '../../../../../../config/job-queues.js';

const BATCH_SIZE = 500;

/** Adapts the durable cron schedule to system cleanup of expired HTTP idempotency receipts. */
@Injectable()
export class PurgeIdempotencyReceiptsJob implements OnApplicationBootstrap {
  // #region Properties
  /** Reports only the number of removed receipts. */
  private readonly logger = new Logger(PurgeIdempotencyReceiptsJob.name);
  // #endregion

  // #region Constructor
  /** Binds the durable scheduler, worker and privileged transaction runner. */
  public constructor(
    private readonly workers: JobWorkerRegistry,
    private readonly scheduler: JobScheduler,
    private readonly system: SystemTransactionRunner,
  ) {}
  // #endregion

  // #region Methods
  /** Registers the same UTC schedule on each replica. */
  public async onApplicationBootstrap(): Promise<void> {
    const queue = PURGE_IDEMPOTENCY_RECEIPTS_QUEUE;
    await this.scheduler.schedule(queue, '* * * * *', { key: 'minutely', timeZone: 'UTC' });
    await this.workers.work(queue, (job: Job) => this.handle(job));
  }

  /** Commits each batch independently and leaves locked receipts for a later occurrence. */
  private async handle(job: Job): Promise<void> {
    if (job.organizationId !== null)
      throw new Error('Idempotency receipt cleanup requires a system job.');

    let purged = 0;
    let count: number;
    do {
      job.signal.throwIfAborted();
      count = await this.deleteBatch();
      purged += count;
    } while (count === BATCH_SIZE);
    if (purged > 0)
      this.logger.log({ jobId: job.id, purged }, 'Expired idempotency receipts removed');
  }

  /** Locks each expired parent before deleting it and cascading to any bulk receipt scope. */
  private deleteBatch(): Promise<number> {
    return this.system.run(async ({ db }) => {
      const result = await db.execute(sql`
        with expired as (
          select id
          from ${idempotencyKeys}
          where expires_at <= now()
          order by expires_at, id
          limit ${BATCH_SIZE}
          for update skip locked
        )
        delete from ${idempotencyKeys} as receipt
        using expired
        where receipt.id = expired.id and receipt.expires_at <= now()
      `);
      return result.rowCount ?? 0;
    });
  }
  // #endregion
}
