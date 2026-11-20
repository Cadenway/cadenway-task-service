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

import type { DeletedTarget } from '../../../../application/models/deletion/deleted-target.model.js';
import { DeletionStepError } from '../../../../application/models/deletion/deletion-step-error.model.js';
import type { MoveDeletedTasksToTrashOutput } from '../../../../application/use-cases/commands/deletion/move-deleted-tasks-to-trash/move-deleted-tasks-to-trash.output.js';
import type { MoveDeletedTasksToTrash } from '../../../../application/use-cases/commands/deletion/move-deleted-tasks-to-trash/move-deleted-tasks-to-trash.use-case.js';

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

/** A deletion job, as `jobSchema` reads it. */
interface DeletionJob {
  // #region Properties
  /** The organization of the transaction of the deletion. */
  readonly organizationId: string;

  /** The payload: the deleted list or space, and the `traceparent` of the deletion. */
  readonly payload: {
    readonly listId?: string | undefined;
    readonly spaceId?: string | undefined;
    readonly traceparent?: string | undefined;
  };
  // #endregion
}

/**
 * Constant jobSchema
 *
 * @description
 * A deletion job: the organization of the transaction that enqueued it, and in its payload either
 * the deleted list (`listId`) or the deleted space (`spaceId`), never both, with the `traceparent`
 * of the deletion when there was a trace. Other members are ignored, so a field added later does
 * not fail an older reader.
 *
 * @type {z.ZodType<DeletionJob>}
 */
const jobSchema: z.ZodType<DeletionJob> = z.object({
  organizationId: z.string().regex(ID_PATTERN),
  payload: z
    .object({
      listId: z.string().regex(ID_PATTERN).optional(),
      spaceId: z.string().regex(ID_PATTERN).optional(),
      traceparent: z.string().optional(),
    })
    .refine(
      (payload: { readonly listId?: string; readonly spaceId?: string }): boolean =>
        (payload.listId === undefined) !== (payload.spaceId === undefined),
      { message: 'A deletion job names exactly one list or one space.' },
    ),
});

/**
 * Function targetOf
 *
 * @description
 * The deleted target of a valid payload, its id lower-cased.
 *
 * @param {DeletionJob['payload']} payload - The payload, with exactly one id.
 * @returns {DeletedTarget} The list or the space.
 */
function targetOf(payload: DeletionJob['payload']): DeletedTarget {
  return payload.listId === undefined
    ? { kind: 'space', spaceId: (payload.spaceId ?? '').toLowerCase() }
    : { kind: 'list', listId: payload.listId.toLowerCase() };
}

/**
 * Function parentContext
 *
 * @description
 * The context the span of a job is started in: the span of the deletion, named by the
 * `traceparent` it stored, becomes its parent, so the events of the job join the trace of the
 * deletion. Without a usable value, the root context.
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
 * Class MoveDeletedTasksToTrashHandler
 *
 * @description
 * The worker of the `task.trash-deleted-tasks` jobs: each job calls `MoveDeletedTasksToTrash` for
 * one deleted list or space, in the organization context the runtime set from the job
 * (lower-cased by `runJobInOrganization`), with the signal of the attempt, inside a `process
 * task.trash-deleted-tasks` span whose parent is the deletion, so the `task.trashed.v1` rows it
 * appends carry the `traceparent` of that trace. The use case commits batch after batch and is
 * idempotent, so a retried attempt resumes from what is left. A rejected attempt is retried by the
 * queue, then becomes a dead letter of `task.trash-deleted-tasks.dead-letter`; the kit logs both,
 * once per failed attempt, with the error, whose message names the failed step and the batches
 * committed before it and holds no SQL text or parameter (`DeletionStepError`); the span records it
 * and the attributes `deletion.step` and `deletion.batches`. A finished job logs, inside its span,
 * its outcome with the job id, the kind of the target and the counts, no id.
 */
export class MoveDeletedTasksToTrashHandler implements OnApplicationBootstrap {
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
  private readonly logger: Logger = new Logger(MoveDeletedTasksToTrashHandler.name);

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
   * Property moveDeletedTasksToTrash
   *
   * @description
   * Use case of the deletion job.
   *
   * @type {MoveDeletedTasksToTrash}
   * @readonly
   */
  private readonly moveDeletedTasksToTrash: MoveDeletedTasksToTrash;

  /**
   * Property queueName
   *
   * @description
   * Queue of the deletion jobs.
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
   * @param {MoveDeletedTasksToTrash} moveDeletedTasksToTrash - Use case of the deletion job.
   * @param {string} queueName - Queue of the deletion jobs.
   * @constructor
   */
  public constructor(
    workers: JobWorkerRegistry,
    moveDeletedTasksToTrash: MoveDeletedTasksToTrash,
    queueName: string,
  ) {
    this.workers = workers;
    this.moveDeletedTasksToTrash = moveDeletedTasksToTrash;
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
   * Moves the tasks of the deleted list or space of a job to the trash, in the span of the job.
   *
   * @param {Job} job - The job.
   * @returns {Promise<void>} Resolves once every deleted list of the target holds nothing left to
   * move, or is live again.
   * @throws {z.ZodError} When the job is not a deletion job: after the retries, a dead letter.
   * @throws {DeletionStepError} When a step fails: the queue retries the job.
   * @throws {Error} When the attempt is aborted: the queue retries the job.
   */
  public async handle(job: Job): Promise<void> {
    const { organizationId, payload }: DeletionJob = jobSchema.parse({
      organizationId: job.organizationId,
      payload: job.payload,
    });
    const target: DeletedTarget = targetOf(payload);
    const parent: Context = parentContext(payload.traceparent);
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
        const result: MoveDeletedTasksToTrashOutput = await this.moveDeletedTasksToTrash.execute({
          organizationId: organizationId.toLowerCase(),
          target,
          signal: job.signal,
        });
        this.logger.log(
          {
            jobId: job.id,
            attempt: job.attempt,
            target: target.kind,
            outcome: result.outcome,
            entries: result.entries,
            tasks: result.tasks,
            requestsDropped: result.requestsDropped,
            listsPurged: result.listsPurged,
            spacePurged: result.spacePurged,
            batches: result.batches,
          },
          'deleted tasks trash job handled',
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
