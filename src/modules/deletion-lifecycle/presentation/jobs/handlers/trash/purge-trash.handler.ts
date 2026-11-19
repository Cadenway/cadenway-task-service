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

import { DeletionStepError } from '../../../../application/models/deletion/deletion-step-error.model.js';
import type { PurgeTrashOutput } from '../../../../application/use-cases/commands/trash/purge-trash/purge-trash.output.js';
import type { PurgeTrash } from '../../../../application/use-cases/commands/trash/purge-trash/purge-trash.use-case.js';

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

/** A purge job, as `jobSchema` reads it. */
interface PurgeJob {
  // #region Properties
  /** The organization of the transaction that enqueued the job. */
  readonly organizationId: string;

  /** The payload: the `traceparent` of "Vider la corbeille" or of the schedule, if any. */
  readonly payload: { readonly traceparent?: string | undefined };
  // #endregion
}

/**
 * Constant jobSchema
 *
 * @description
 * A purge job: the organization of the transaction that enqueued it ("Vider la corbeille", or the
 * system transaction of the schedule, which sets it), and a payload that holds at most the
 * `traceparent` of what enqueued it. Other members are ignored, so a field added later does not
 * fail an older reader.
 *
 * @type {z.ZodType<PurgeJob>}
 */
const jobSchema: z.ZodType<PurgeJob> = z.object({
  organizationId: z.string().regex(ID_PATTERN),
  payload: z.object({ traceparent: z.string().optional() }),
});

/**
 * Function parentContext
 *
 * @description
 * The context the span of a job is started in: the span that enqueued it, named by the
 * `traceparent` it stored, becomes its parent, so the `task.purged.v1` of the job join that trace.
 * Without a usable value, the root context.
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
 * Class PurgeTrashHandler
 *
 * @description
 * The worker of the `task.purge-trash` jobs: each job calls `PurgeTrash` for one organization, in
 * the organization context the runtime set from the job (lower-cased by `runJobInOrganization`),
 * with the signal of the attempt, inside a `process task.purge-trash` span whose parent is what
 * enqueued it. The use case commits batch after batch and is idempotent, so a retried attempt
 * erases what is left. A rejected attempt is retried by the queue, then becomes a dead letter of
 * `task.purge-trash.dead-letter`; the kit logs both, once per failed attempt, with the error, whose
 * message names the step `purge` and the batches committed before it (`DeletionStepError`); the
 * span records the exception and the attributes `deletion.step` and `deletion.batches`; the
 * message holds no SQL text or parameter. A finished job logs, inside its span, what it erased with
 * the job id and the counts, no id.
 */
export class PurgeTrashHandler implements OnApplicationBootstrap {
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
  private readonly logger: Logger = new Logger(PurgeTrashHandler.name);

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
   * Property purgeTrash
   *
   * @description
   * Use case of the purge.
   *
   * @type {PurgeTrash}
   * @readonly
   */
  private readonly purgeTrash: PurgeTrash;

  /**
   * Property queueName
   *
   * @description
   * Queue of the purge jobs.
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
   * @param {PurgeTrash} purgeTrash - Use case of the purge.
   * @param {string} queueName - Queue of the purge jobs.
   * @constructor
   */
  public constructor(workers: JobWorkerRegistry, purgeTrash: PurgeTrash, queueName: string) {
    this.workers = workers;
    this.purgeTrash = purgeTrash;
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
   * Erases the trash of the organization of a job that is due or handed over, in the span of the
   * job.
   *
   * @param {Job} job - The job.
   * @returns {Promise<void>} Resolves once nothing due or handed over is left.
   * @throws {z.ZodError} When the job is not a purge job: after the retries, a dead letter.
   * @throws {DeletionStepError} When a batch fails: the queue retries the job.
   * @throws {Error} When the attempt is aborted: the queue retries the job.
   */
  public async handle(job: Job): Promise<void> {
    const {
      organizationId,
      payload: { traceparent },
    }: PurgeJob = jobSchema.parse({ organizationId: job.organizationId, payload: job.payload });
    const parent: Context = parentContext(traceparent);
    const span: Span = trace
      .getTracer('task-service')
      .startSpan(
        `process ${this.queueName}`,
        { kind: SpanKind.CONSUMER, attributes: { 'job.id': job.id, 'job.attempt': job.attempt } },
        parent,
      );
    try {
      // The outcome is logged inside the span of the job, so the line carries its trace.
      await context.with(trace.setSpan(parent, span), async (): Promise<void> => {
        const result: PurgeTrashOutput = await this.purgeTrash.execute({
          organizationId: organizationId.toLowerCase(),
          signal: job.signal,
        });
        this.logger.log(
          {
            jobId: job.id,
            attempt: job.attempt,
            entries: result.entries,
            tasks: result.tasks,
            listsPurged: result.listsPurged,
            spacesPurged: result.spacesPurged,
            batches: result.batches,
          },
          'trash purge job handled',
        );
      });
    } catch (error: unknown) {
      // The kit logs the failed attempt once, with this error, whose message holds no SQL text or
      // parameter (`DeletionStepError`); the span says where it stopped.
      span.recordException(error instanceof Error ? error : String(error));
      if (error instanceof DeletionStepError) {
        span.setAttributes({ 'deletion.step': error.step, 'deletion.batches': error.batches });
      }
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'job attempt failed' });
      throw error;
    } finally {
      span.end();
    }
  }
  // #endregion
}
