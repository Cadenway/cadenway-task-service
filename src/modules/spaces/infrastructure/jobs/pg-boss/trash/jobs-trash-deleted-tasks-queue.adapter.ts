import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueResult, JobProducer } from '@cadenway/nest-jobs/runtime';
import { context, propagation } from '@opentelemetry/api';

import { TRASH_DELETED_TASKS_QUEUE } from '../../../../../../config/job-queues.js';
import type { TrashDeletedTasksQueue } from '../../../../application/ports/outbound/jobs/trash/trash-deleted-tasks-queue.port.js';

/**
 * Type TrashDeletedTasksJobPayload
 *
 * @description
 * The stored payload of a job of `task.trash-deleted-tasks`: the deleted list or the deleted
 * space, and the W3C `traceparent` of the deletion when a trace was active, so the job continues
 * it. The organization travels in the envelope of the kit, from the transaction that enqueued it.
 * A stored format: fields are only ever added, and a reader accepts a payload without
 * `traceparent`.
 *
 * @type {object}
 */
type TrashDeletedTasksJobPayload =
  | { readonly listId: string; readonly traceparent?: string }
  | { readonly spaceId: string; readonly traceparent?: string };

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
 * Class JobsTrashDeletedTasksQueue
 *
 * @description
 * `TrashDeletedTasksQueue` on the `task.trash-deleted-tasks` queue of `@cadenway/nest-jobs`, bound
 * to the tenant transaction of a unit of work: the job row is inserted through the connection of
 * that transaction, so it exists if and only if the deletion commits, and the kit stores the
 * organization of that transaction in its envelope, as it was spelled there. The occurrence key is
 * the list or the space and its version after the deletion (`list:<listId>:<version>`,
 * `space:<spaceId>:<version>`), which the kit scopes to that organization: a deletion requeued
 * enqueues nothing more, while a later deletion of the same list or space, after a restoration
 * from the trash, takes a higher version and is a new occurrence.
 */
export class JobsTrashDeletedTasksQueue implements TrashDeletedTasksQueue {
  // #region Properties
  /**
   * Property transaction
   *
   * @description
   * The tenant transaction of the unit of work.
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
   * @param {TransactionScope} transaction - The tenant transaction of the unit of work.
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
   * Enqueues the move to the trash of the tasks of one deletion once per list or space and
   * version, with the active `traceparent`.
   *
   * @param {{ readonly kind: 'list'; readonly listId: string; readonly version: number } | { readonly kind: 'space'; readonly spaceId: string; readonly version: number }} deletion -
   * The deleted list or space, and its version after the deletion.
   * @returns {Promise<boolean>} `true` when a job was inserted, `false` for a duplicate.
   */
  public async enqueue(
    deletion:
      | { readonly kind: 'list'; readonly listId: string; readonly version: number }
      | { readonly kind: 'space'; readonly spaceId: string; readonly version: number },
  ): Promise<boolean> {
    const traceparent: string | undefined = activeTraceparent();
    const target: { readonly listId: string } | { readonly spaceId: string } =
      deletion.kind === 'list' ? { listId: deletion.listId } : { spaceId: deletion.spaceId };
    const payload: TrashDeletedTasksJobPayload =
      traceparent === undefined ? target : { ...target, traceparent };
    const occurrenceKey: string =
      deletion.kind === 'list'
        ? `list:${deletion.listId}:${String(deletion.version)}`
        : `space:${deletion.spaceId}:${String(deletion.version)}`;
    const result: JobEnqueueResult = await this.jobs.enqueue(
      this.transaction,
      TRASH_DELETED_TASKS_QUEUE,
      payload,
      { occurrenceKey },
    );
    return !result.duplicate;
  }
  // #endregion
}
