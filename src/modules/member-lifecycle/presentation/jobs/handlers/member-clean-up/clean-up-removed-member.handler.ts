import type { Job, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import { Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import type { Context, Span } from '@opentelemetry/api';
import { z } from 'zod';

import type { CleanUpRemovedMemberOutput } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.output.js';
import type { CleanUpRemovedMember } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.use-case.js';

/**
 * Constant ID_PATTERN
 *
 * @description
 * An id the tenant transaction runner of `@cadenway/nest-common` accepts (its `UUID_PATTERN`): any
 * 8-4-4-4-12 hexadecimal id, in either case, whatever its version and variant bits. `z.uuid()`
 * would refuse ids the contracts accept (`format: uuid`), and the job would end as a dead letter.
 *
 * @type {RegExp}
 */
const ID_PATTERN: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Constant jobSchema
 *
 * @description
 * A clean-up job: the organization of the transaction that enqueued it, and the account in its
 * payload, with the `traceparent` of the removal when there was a trace. Other members are
 * ignored, so a field added later does not fail an older reader.
 *
 * @type {z.ZodType<{ readonly organizationId: string; readonly payload: { readonly userId: string; readonly traceparent?: string | undefined } }>}
 */
const jobSchema: z.ZodType<{
  readonly organizationId: string;
  readonly payload: { readonly userId: string; readonly traceparent?: string | undefined };
}> = z.object({
  organizationId: z.string().regex(ID_PATTERN),
  payload: z.object({
    userId: z.string().regex(ID_PATTERN),
    traceparent: z.string().optional(),
  }),
});

/**
 * Function parentContext
 *
 * @description
 * The context the span of a job is started in: the span of the delivery of the removal, named by
 * the `traceparent` it stored, becomes its parent, so the events of the job join the trace of the
 * removal. Without a usable value, the root context.
 *
 * @param {string | undefined} traceparent - The stored `traceparent`.
 * @returns {Context} The parent context.
 */
function parentContext(traceparent: string | undefined): Context {
  return traceparent === undefined || traceparent === ''
    ? ROOT_CONTEXT
    : propagation.extract(ROOT_CONTEXT, { traceparent });
}

/**
 * Class CleanUpRemovedMemberHandler
 *
 * @description
 * The worker of the clean-up jobs: each job calls `CleanUpRemovedMember` for one former member, in
 * the organization context the runtime set from the job (lower-cased by `runJobInOrganization`),
 * with the signal of the attempt, inside a `process task.clean-up-removed-member` span whose parent
 * is the delivery of the removal, so the `space.updated.v1` and `task.updated.v1` rows it appends
 * carry the `traceparent` of that trace. The use case commits batch after batch and is idempotent,
 * so a retried attempt resumes from what is left. A rejected attempt is retried by the queue, then
 * becomes a dead letter of `task.clean-up-removed-member.dead-letter`; the kit logs both. A
 * finished job logs its outcome with the job id and the counts, never the account, and warns once
 * when it left private spaces awaiting an owner.
 */
export class CleanUpRemovedMemberHandler implements OnApplicationBootstrap {
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
  private readonly logger: Logger = new Logger(CleanUpRemovedMemberHandler.name);

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
   * Property cleanUpRemovedMember
   *
   * @description
   * Use case of the clean-up.
   *
   * @type {CleanUpRemovedMember}
   * @readonly
   */
  private readonly cleanUpRemovedMember: CleanUpRemovedMember;

  /**
   * Property queueName
   *
   * @description
   * Queue of the clean-up jobs.
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
   * @param {CleanUpRemovedMember} cleanUpRemovedMember - Use case of the clean-up.
   * @param {string} queueName - Queue of the clean-up jobs.
   * @constructor
   */
  public constructor(
    workers: JobWorkerRegistry,
    cleanUpRemovedMember: CleanUpRemovedMember,
    queueName: string,
  ) {
    this.workers = workers;
    this.cleanUpRemovedMember = cleanUpRemovedMember;
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
   * Cleans up after the former member of a job, in the span of the job.
   *
   * @param {Job} job - The job.
   * @returns {Promise<void>} Resolves once nothing is left to hand over or unassign, or once the
   * copy holds the account as a member again.
   * @throws {z.ZodError} When the job is not a clean-up job: after the retries, a dead letter.
   * @throws {Error} When a batch fails or the attempt is aborted: the queue retries the job.
   */
  public async handle(job: Job): Promise<void> {
    const {
      organizationId,
      payload: { userId, traceparent },
    }: {
      readonly organizationId: string;
      readonly payload: { readonly userId: string; readonly traceparent?: string | undefined };
    } = jobSchema.parse({ organizationId: job.organizationId, payload: job.payload });
    const parent: Context = parentContext(traceparent);
    const span: Span = trace
      .getTracer('task-service')
      .startSpan(
        `process ${this.queueName}`,
        { kind: SpanKind.CONSUMER, attributes: { 'job.id': job.id, 'job.attempt': job.attempt } },
        parent,
      );
    try {
      const result: CleanUpRemovedMemberOutput = await context.with(
        trace.setSpan(parent, span),
        (): Promise<CleanUpRemovedMemberOutput> =>
          this.cleanUpRemovedMember.execute({
            organizationId: organizationId.toLowerCase(),
            userId: userId.toLowerCase(),
            signal: job.signal,
          }),
      );
      this.logger.log(
        {
          jobId: job.id,
          attempt: job.attempt,
          outcome: result.outcome,
          spacesHandedOver: result.spacesHandedOver,
          spacesAwaitingOwner: result.spacesAwaitingOwner,
          tasksUnassigned: result.tasksUnassigned,
          batches: result.batches,
        },
        'removed member clean-up job handled',
      );
      if (result.spacesAwaitingOwner > 0) {
        this.logger.warn(
          { jobId: job.id },
          'A removed member owned private spaces while the owner of the organization is unknown: they await an owner.',
        );
      }
    } catch (error: unknown) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'job attempt failed' });
      throw error;
    } finally {
      span.end();
    }
  }
  // #endregion
}
