import type { Job, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import { Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { z } from 'zod';

import type { UnassignRemovedMemberOutput } from '../../../../application/use-cases/commands/assignee/unassign-removed-member/unassign-removed-member.output.js';
import type { UnassignRemovedMember } from '../../../../application/use-cases/commands/assignee/unassign-removed-member/unassign-removed-member.use-case.js';

/**
 * Constant jobSchema
 *
 * @description
 * An unassignment job: the organization of the transaction that enqueued it, and the account in
 * its payload, nothing else.
 *
 * @type {z.ZodType<{ readonly organizationId: string; readonly payload: { readonly userId: string } }>}
 */
const jobSchema: z.ZodType<{
  readonly organizationId: string;
  readonly payload: { readonly userId: string };
}> = z.object({
  organizationId: z.uuid(),
  payload: z.object({ userId: z.uuid() }),
});

/**
 * Class UnassignRemovedMemberHandler
 *
 * @description
 * The worker of the unassignment jobs: each job calls `UnassignRemovedMember` for one former
 * member, in the organization context the runtime set from the job, with the signal of the attempt.
 * The use case commits batch after batch and is idempotent, so a retried attempt resumes from the
 * tasks still assigned. A rejected attempt is retried by the queue, then becomes a dead letter of
 * `task.unassign-removed-member.dead-letter`; the kit logs both. A finished job logs its outcome
 * with the job id and the counts, never the account.
 */
export class UnassignRemovedMemberHandler implements OnApplicationBootstrap {
  // #region Properties
  /**
   * Property logger
   *
   * @description
   * Logs the outcome of a job with its id and counts only.
   *
   * @type {Logger}
   * @readonly
   */
  private readonly logger: Logger = new Logger(UnassignRemovedMemberHandler.name);

  /**
   * Property workers
   *
   * @description
   * The workers of `@cadenway/nest-jobs`.
   *
   * @type {JobWorkerRegistry}
   * @readonly
   */
  private readonly workers: JobWorkerRegistry;

  /**
   * Property unassignRemovedMember
   *
   * @description
   * Use case of the unassignment.
   *
   * @type {UnassignRemovedMember}
   * @readonly
   */
  private readonly unassignRemovedMember: UnassignRemovedMember;

  /**
   * Property queueName
   *
   * @description
   * Queue of the unassignment jobs.
   *
   * @type {string}
   * @readonly
   */
  private readonly queueName: string;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the workers, the use case and the queue.
   *
   * @param {JobWorkerRegistry} workers - The workers.
   * @param {UnassignRemovedMember} unassignRemovedMember - Use case of the unassignment.
   * @param {string} queueName - Queue of the unassignment jobs.
   * @constructor
   */
  public constructor(
    workers: JobWorkerRegistry,
    unassignRemovedMember: UnassignRemovedMember,
    queueName: string,
  ) {
    this.workers = workers;
    this.unassignRemovedMember = unassignRemovedMember;
    this.queueName = queueName;
  }
  // #endregion

  // #region Methods
  /**
   * Method onApplicationBootstrap
   *
   * @description
   * Registers the worker of the queue, one job at a time per replica.
   *
   * @returns {Promise<void>} Resolves once registered.
   */
  public async onApplicationBootstrap(): Promise<void> {
    await this.workers.work(this.queueName, (job: Job): Promise<void> => this.handle(job));
  }

  /**
   * Method handle
   *
   * @description
   * Unassigns the former member of a job from their tasks.
   *
   * @param {Job} job - The job.
   * @returns {Promise<void>} Resolves once no task is left assigned to the account, or once the
   * copy holds the account as a member again.
   * @throws {z.ZodError} When the job is not an unassignment job: it ends as a dead letter.
   * @throws {Error} When a batch fails or the attempt is aborted: the queue retries the job.
   */
  public async handle(job: Job): Promise<void> {
    const {
      organizationId,
      payload: { userId },
    }: { readonly organizationId: string; readonly payload: { readonly userId: string } } =
      jobSchema.parse({ organizationId: job.organizationId, payload: job.payload });
    const result: UnassignRemovedMemberOutput = await this.unassignRemovedMember.execute({
      organizationId: organizationId.toLowerCase(),
      userId: userId.toLowerCase(),
      signal: job.signal,
    });
    this.logger.log(
      {
        jobId: job.id,
        attempt: job.attempt,
        outcome: result.outcome,
        unassigned: result.unassigned,
        batches: result.batches,
      },
      'removed member unassignment job handled',
    );
  }
  // #endregion
}
