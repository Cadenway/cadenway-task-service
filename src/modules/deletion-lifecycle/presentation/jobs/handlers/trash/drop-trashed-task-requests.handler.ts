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
import type { DropTrashedTaskRequestsOutput } from '../../../../application/use-cases/commands/trash/drop-trashed-task-requests/drop-trashed-task-requests.output.js';
import type { DropTrashedTaskRequests } from '../../../../application/use-cases/commands/trash/drop-trashed-task-requests/drop-trashed-task-requests.use-case.js';

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

/** A job of the requests of a trash entry, as `jobSchema` reads it. */
interface TrashedRequestsJob {
  // #region Properties
  /** The organization of the transaction of the trash. */
  readonly organizationId: string;

  /** The payload: the tasks of the entry, and the `traceparent` of the trash. */
  readonly payload: {
    readonly taskIds: readonly string[];
    readonly traceparent?: string | undefined;
  };
  // #endregion
}

/**
 * Constant jobSchema
 *
 * @description
 * A job of the requests of a trash entry: the organization of the transaction that enqueued it,
 * and in its payload the tasks of the entry (651 live tasks at most and the archived subtasks of
 * its root, which the product does not limit: the adapters take them 2,000 at a time), with the
 * `traceparent` of "Supprimer la tâche" when there was a trace. Other members are ignored, so a field added later does not fail
 * an older reader.
 *
 * @type {z.ZodType<TrashedRequestsJob>}
 */
const jobSchema: z.ZodType<TrashedRequestsJob> = z.object({
  organizationId: z.string().regex(ID_PATTERN),
  payload: z.object({
    taskIds: z.array(z.string().regex(ID_PATTERN)),
    traceparent: z.string().optional(),
  }),
});

/**
 * Function parentContext
 *
 * @description
 * The context the span of a job is started in: the span of the trash, named by the `traceparent`
 * it stored, becomes its parent. Without a usable value, the root context.
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
 * Class DropTrashedTaskRequestsHandler
 *
 * @description
 * The worker of the `task.drop-trashed-task-requests` jobs: each job calls
 * `DropTrashedTaskRequests` for the tasks of one trash entry, in the organization context the
 * runtime set from the job (lower-cased by `runJobInOrganization`), inside a `process
 * task.drop-trashed-task-requests` span whose parent is the trash. The use case is one transaction
 * and idempotent. A rejected attempt is retried by the queue, then becomes a dead letter of
 * `task.drop-trashed-task-requests.dead-letter`; the kit logs both, once per failed attempt, with
 * the error, a `DeletionStepError` of the step `requests` whose message holds no SQL text or
 * parameter, and the span records it with `deletion.step` and `deletion.batches`. A finished job
 * logs, inside its span, the numbers of tasks, of tasks found out of the trash and of requests
 * dropped with the job id, no id of a task or a person.
 */
export class DropTrashedTaskRequestsHandler implements OnApplicationBootstrap {
  // #region Properties
  /**
   * Property logger
   *
   * @description
   * Logs the outcome of a job with its id and count only.
   *
   * @type {Logger}
   * @readonly
   */
  private readonly logger: Logger = new Logger(DropTrashedTaskRequestsHandler.name);

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
   * Property dropTrashedTaskRequests
   *
   * @description
   * Use case of the job.
   *
   * @type {DropTrashedTaskRequests}
   * @readonly
   */
  private readonly dropTrashedTaskRequests: DropTrashedTaskRequests;

  /**
   * Property queueName
   *
   * @description
   * Queue of the jobs.
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
   * @param {DropTrashedTaskRequests} dropTrashedTaskRequests - Use case of the job.
   * @param {string} queueName - Queue of the jobs.
   * @constructor
   */
  public constructor(
    workers: JobWorkerRegistry,
    dropTrashedTaskRequests: DropTrashedTaskRequests,
    queueName: string,
  ) {
    this.workers = workers;
    this.dropTrashedTaskRequests = dropTrashedTaskRequests;
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
   * Drops the pending requests of the tasks of a job, in the span of the job.
   *
   * @param {Job} job - The job.
   * @returns {Promise<void>} Resolves once the requests are dropped.
   * @throws {z.ZodError} When the job is not one of this queue: after the retries, a dead letter.
   * @throws {Error} When the transaction fails: the queue retries the job.
   */
  public async handle(job: Job): Promise<void> {
    const {
      organizationId,
      payload: { taskIds, traceparent },
    }: TrashedRequestsJob = jobSchema.parse({
      organizationId: job.organizationId,
      payload: job.payload,
    });
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
        const result: DropTrashedTaskRequestsOutput = await this.dropTrashedTaskRequests.execute({
          organizationId: organizationId.toLowerCase(),
          taskIds: taskIds.map((taskId: string): string => taskId.toLowerCase()),
        });
        this.logger.log(
          {
            jobId: job.id,
            attempt: job.attempt,
            tasks: taskIds.length,
            untrashed: result.untrashed,
            dropped: result.dropped,
          },
          'trashed task requests job handled',
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
