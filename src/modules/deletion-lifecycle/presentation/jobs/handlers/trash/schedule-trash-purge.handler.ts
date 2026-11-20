import type { Job, JobScheduler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import { Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { context, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { z } from 'zod';

import { DeletionStepError } from '../../../../application/models/deletion/deletion-step-error.model.js';
import type { ScheduleTrashPurgeOutput } from '../../../../application/use-cases/commands/trash/schedule-trash-purge/schedule-trash-purge.output.js';
import type { ScheduleTrashPurge } from '../../../../application/use-cases/commands/trash/schedule-trash-purge/schedule-trash-purge.use-case.js';

/**
 * Constant DAILY_AT_THREE
 *
 * @description
 * The cron of the purge: every day at 03:00, in `TIME_ZONE` ("erased for good 30 days after its
 * deletion, by a daily job" of `openapi/public/trash.yaml`). An entry is due by its `trashed_at`,
 * so the hour only decides when the erasures of the day run: an entry can stay in the trash up to
 * a day past its `purgeAt`.
 *
 * @type {string}
 */
const DAILY_AT_THREE: string = '0 3 * * *';

/**
 * Constant TIME_ZONE
 *
 * @description
 * The time zone the cron is evaluated in: UTC, so the schedule never follows the local time of a
 * server or a change of daylight saving time.
 *
 * @type {string}
 */
const TIME_ZONE: string = 'UTC';

/**
 * Constant SCHEDULE_KEY
 *
 * @description
 * The key of the schedule on its queue: every replica registers the same queue and key at start-up,
 * which replaces the one schedule rather than adding one.
 *
 * @type {string}
 */
const SCHEDULE_KEY: string = 'daily';

/** An occurrence of the schedule, as `jobSchema` reads it. */
interface ScheduleJob {
  // #region Properties
  /** No organization: a scheduled job runs outside any. */
  readonly organizationId: null;
  // #endregion
}

/**
 * Constant jobSchema
 *
 * @description
 * An occurrence of the schedule: a job without organization, whose payload is not read (the
 * schedule registers none).
 *
 * @type {z.ZodType<ScheduleJob>}
 */
const jobSchema: z.ZodType<ScheduleJob> = z.object({ organizationId: z.null() });

/**
 * Class ScheduleTrashPurgeHandler
 *
 * @description
 * The daily schedule of the purge and its worker. At start-up it registers the durable schedule of
 * `task.schedule-trash-purge` (`0 3 * * *`, UTC, key `daily`: the same row whatever the number of
 * replicas, one job per occurrence) and the worker of the queue. Each occurrence calls
 * `ScheduleTrashPurge` with the id of its job, outside any organization context (a scheduled job
 * has none), inside a `process task.schedule-trash-purge` span at the root of a trace, which the
 * purge jobs it enqueues continue. A rejected attempt is retried by the queue, then becomes a dead
 * letter of `task.schedule-trash-purge.dead-letter`; the kit logs both, once per failed attempt,
 * with the error, a `DeletionStepError` of the step `schedule` whose message holds no SQL text or
 * parameter, and the span records it with `deletion.step` and `deletion.batches`. A finished
 * occurrence logs its counts with the job id, inside its span.
 */
export class ScheduleTrashPurgeHandler implements OnApplicationBootstrap {
  // #region Properties
  /**
   * Property logger
   *
   * @description
   * Logs the outcome of an occurrence with its job id and counts only.
   *
   * @type {Logger}
   * @readonly
   */
  private readonly logger: Logger = new Logger(ScheduleTrashPurgeHandler.name);

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
   * Property scheduler
   *
   * @description
   * The durable schedules of `@cadenway/nest-jobs`.
   *
   * @type {JobScheduler}
   * @readonly
   */
  private readonly scheduler: JobScheduler;

  /**
   * Property scheduleTrashPurge
   *
   * @description
   * Use case of an occurrence.
   *
   * @type {ScheduleTrashPurge}
   * @readonly
   */
  private readonly scheduleTrashPurge: ScheduleTrashPurge;

  /**
   * Property queueName
   *
   * @description
   * Queue of the schedule.
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
   * Takes the workers, the scheduler, the use case and the queue.
   *
   * @param {JobWorkerRegistry} workers - The workers.
   * @param {JobScheduler} scheduler - The durable schedules.
   * @param {ScheduleTrashPurge} scheduleTrashPurge - Use case of an occurrence.
   * @param {string} queueName - Queue of the schedule.
   * @constructor
   */
  public constructor(
    workers: JobWorkerRegistry,
    scheduler: JobScheduler,
    scheduleTrashPurge: ScheduleTrashPurge,
    queueName: string,
  ) {
    this.workers = workers;
    this.scheduler = scheduler;
    this.scheduleTrashPurge = scheduleTrashPurge;
    this.queueName = queueName;
  }
  // #endregion

  // #region Methods
  /**
   * Method onApplicationBootstrap
   *
   * @description
   * Registers the daily schedule, replacing the one another replica registered, then the worker of
   * the queue, one job at a time per replica.
   *
   * @returns {Promise<void>} Resolves once both are registered.
   * @throws {Error} When the schedule cannot be stored: the start-up fails.
   */
  public async onApplicationBootstrap(): Promise<void> {
    await this.scheduler.schedule(this.queueName, DAILY_AT_THREE, {
      timeZone: TIME_ZONE,
      key: SCHEDULE_KEY,
    });
    await this.workers.work(this.queueName, (job: Job): Promise<void> => this.handle(job));
  }

  /**
   * Method handle
   *
   * @description
   * Enqueues the purge of every organization with trash to erase, in the span of the occurrence.
   *
   * @param {Job} job - The occurrence.
   * @returns {Promise<void>} Resolves once every page is enqueued.
   * @throws {z.ZodError} When the job carries an organization, so it is not an occurrence of the
   * schedule: after the retries, a dead letter.
   * @throws {Error} When a read or an insert fails, or the attempt is aborted: the queue retries the
   * job.
   */
  public async handle(job: Job): Promise<void> {
    jobSchema.parse({ organizationId: job.organizationId });
    const span: Span = trace
      .getTracer('task-service')
      .startSpan(
        `process ${this.queueName}`,
        { kind: SpanKind.CONSUMER, attributes: { 'job.id': job.id, 'job.attempt': job.attempt } },
        ROOT_CONTEXT,
      );
    try {
      // The outcome is logged inside the span of the occurrence, so the line carries its trace.
      await context.with(trace.setSpan(ROOT_CONTEXT, span), async (): Promise<void> => {
        const result: ScheduleTrashPurgeOutput = await this.scheduleTrashPurge.execute({
          jobId: job.id,
          signal: job.signal,
        });
        this.logger.log(
          {
            jobId: job.id,
            attempt: job.attempt,
            organizations: result.organizations,
            enqueued: result.enqueued,
            pages: result.pages,
          },
          'trash purge schedule job handled',
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
