import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobProducer } from '@cadenway/nest-jobs/runtime';
import { context, propagation } from '@opentelemetry/api';

import {
  DROP_TRASHED_TASK_REQUESTS_QUEUE,
  PURGE_TRASH_QUEUE,
} from '../../../../../../config/job-queues.js';
import type { TrashJobs } from '../../../../application/ports/outbound/jobs/trash/trash-jobs.port.js';

/**
 * Interface DropTrashedTaskRequestsPayload
 *
 * @description
 * The payload of `task.drop-trashed-task-requests`: the tasks of one entry and the trace of the
 * deletion, so the worker continues it.
 */
interface DropTrashedTaskRequestsPayload {
  // #region Properties
  /** The tasks of the entry. */
  readonly taskIds: readonly string[];

  /** The W3C `traceparent` of the deletion, when it is traced. */
  readonly traceparent?: string;
  // #endregion
}

/**
 * Interface PurgeTrashPayload
 *
 * @description
 * The payload of `task.purge-trash`: the trace of "Vider la corbeille" only; the job reads the
 * entries handed over from the table.
 */
interface PurgeTrashPayload {
  // #region Properties
  /** The W3C `traceparent` of the request, when it is traced. */
  readonly traceparent?: string;
  // #endregion
}

/**
 * Function activeTraceparent
 *
 * @description
 * The `traceparent` of the active span, as the W3C propagator writes it, or `undefined` when the
 * process does not trace.
 *
 * @returns {string | undefined} The `traceparent`.
 */
function activeTraceparent(): string | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent;
}

/**
 * Class JobsTrashJobs
 *
 * @description
 * `TrashJobs` on the `JobProducer` of `@cadenway/nest-jobs`, bound to the tenant transaction of
 * its unit of work: each job row is inserted in that transaction (with the organization of the
 * transaction in its envelope), so it commits with the trash or "Vider la corbeille", or not at
 * all. `task.drop-trashed-task-requests` carries the occurrence key `entry:<entryId>`, so the same
 * entry never enqueues twice; `task.purge-trash` none, as two jobs of one organization share the
 * entries.
 */
export class JobsTrashJobs implements TrashJobs {
  // #region Properties
  /**
   * Property transaction
   *
   * @description
   * The tenant transaction the jobs are inserted in.
   *
   * @type {TransactionScope}
   * @readonly
   */
  private readonly transaction: TransactionScope;

  /**
   * Property jobs
   *
   * @description
   * The producer of the kit.
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
   * Binds the jobs to a transaction.
   *
   * @param {TransactionScope} transaction - The tenant transaction.
   * @param {JobProducer} jobs - The producer of the kit.
   * @constructor
   */
  public constructor(transaction: TransactionScope, jobs: JobProducer) {
    this.transaction = transaction;
    this.jobs = jobs;
  }
  // #endregion

  // #region Methods
  /**
   * Method dropTrashedTaskRequests
   *
   * @description
   * Enqueues `task.drop-trashed-task-requests` for the tasks of an entry, key `entry:<entryId>`.
   *
   * @param {string} entryId - The entry.
   * @param {readonly string[]} taskIds - Its tasks.
   * @returns {Promise<void>} Resolves once enqueued, or when it was already.
   */
  public async dropTrashedTaskRequests(entryId: string, taskIds: readonly string[]): Promise<void> {
    const traceparent: string | undefined = activeTraceparent();
    const payload: DropTrashedTaskRequestsPayload =
      traceparent === undefined
        ? { taskIds: [...taskIds] }
        : { taskIds: [...taskIds], traceparent };
    await this.jobs.enqueue(this.transaction, DROP_TRASHED_TASK_REQUESTS_QUEUE, payload, {
      occurrenceKey: `entry:${entryId}`,
    });
  }

  /**
   * Method purgeTrash
   *
   * @description
   * Enqueues one `task.purge-trash` for the organization of the transaction, without occurrence
   * key.
   *
   * @returns {Promise<void>} Resolves once enqueued.
   */
  public async purgeTrash(): Promise<void> {
    const traceparent: string | undefined = activeTraceparent();
    const payload: PurgeTrashPayload = traceparent === undefined ? {} : { traceparent };
    await this.jobs.enqueue(this.transaction, PURGE_TRASH_QUEUE, payload);
  }
  // #endregion
}
