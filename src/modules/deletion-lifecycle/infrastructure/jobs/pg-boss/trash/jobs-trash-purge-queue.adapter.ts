import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueResult, JobProducer } from '@cadenway/nest-jobs/runtime';
import { context, propagation } from '@opentelemetry/api';

import { PURGE_TRASH_QUEUE } from '../../../../../../config/job-queues.js';
import type { TrashPurgeQueue } from '../../../../application/ports/outbound/jobs/trash/trash-purge-queue.port.js';

/**
 * Interface PurgeJobPayload
 *
 * @description
 * The stored payload of a purge job: the W3C `traceparent` of the occurrence of the schedule when a
 * trace was active, so the job continues it, and nothing else. The organization travels in the
 * envelope of the kit. A stored format: fields are only ever added, and a reader accepts `{}`.
 */
interface PurgeJobPayload {
  // #region Properties
  /** The `traceparent` of the schedule, absent without an active trace. */
  readonly traceparent?: string;
  // #endregion
}

/**
 * Function activeTraceparent
 *
 * @description
 * Reads the `traceparent` of the active OpenTelemetry context through the global propagator, the
 * one `@cadenway/nest-common/telemetry` registers.
 *
 * @returns {string | undefined} The `traceparent`, or `undefined` without a span or a propagator.
 */
function activeTraceparent(): string | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent;
}

/**
 * Class JobsTrashPurgeQueue
 *
 * @description
 * `TrashPurgeQueue` on the `task.purge-trash` queue of `@cadenway/nest-jobs`, bound to the system
 * transaction of a run of the unit of work of the schedule: each job row is inserted through the
 * connection of that transaction, with the envelope of its organization
 * (`{ client: transaction.client, organizationId }`), so the worker runs the job in that
 * organization, and it exists if and only if the transaction commits. The occurrence key, scoped
 * by the kit to the queue and the organization, is the same for every organization of an
 * occurrence of the schedule: enqueuing the same organization again while its job is kept (7 days
 * after it finished) does nothing.
 */
export class JobsTrashPurgeQueue implements TrashPurgeQueue {
  // #region Properties
  /**
   * Property transaction
   *
   * @description
   * The system transaction of the unit of work.
   *
   * @type {TransactionScope}
   * @readonly
   */
  private readonly transaction: TransactionScope;

  /**
   * Property jobs
   *
   * @description
   * The producer of `@cadenway/nest-jobs`.
   *
   * @type {JobProducer}
   * @readonly
   */
  private readonly jobs: JobProducer;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the queue to a transaction.
   *
   * @param {TransactionScope} transaction - The system transaction of the unit of work.
   * @param {JobProducer} jobs - The producer of `@cadenway/nest-jobs`.
   * @constructor
   */
  public constructor(transaction: TransactionScope, jobs: JobProducer) {
    this.transaction = transaction;
    this.jobs = jobs;
  }
  // #endregion

  // #region Methods
  /**
   * Method enqueue
   *
   * @description
   * Enqueues the purge of one organization under the occurrence, with the active `traceparent`.
   *
   * @param {string} organizationId - The organization, in lower case.
   * @param {string} occurrenceKey - The occurrence of the schedule.
   * @returns {Promise<boolean>} `true` when a job was inserted, `false` for a duplicate.
   */
  public async enqueue(organizationId: string, occurrenceKey: string): Promise<boolean> {
    const traceparent: string | undefined = activeTraceparent();
    const payload: PurgeJobPayload = traceparent === undefined ? {} : { traceparent };
    const result: JobEnqueueResult = await this.jobs.enqueue(
      { client: this.transaction.client, organizationId },
      PURGE_TRASH_QUEUE,
      payload,
      { occurrenceKey },
    );
    return !result.duplicate;
  }
  // #endregion
}
