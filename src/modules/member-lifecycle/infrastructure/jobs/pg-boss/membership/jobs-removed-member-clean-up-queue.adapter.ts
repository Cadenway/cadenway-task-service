import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueResult, JobProducer } from '@cadenway/nest-jobs/runtime';
import { context, propagation } from '@opentelemetry/api';

import { CLEAN_UP_REMOVED_MEMBER_QUEUE } from '../../../../../../config/job-queues.js';
import type { RemovedMemberCleanUpQueue } from '../../../../application/ports/outbound/jobs/membership/removed-member-clean-up-queue.port.js';

/**
 * Interface CleanUpJobPayload
 *
 * @description
 * The stored payload of a clean-up job: the account, and the W3C `traceparent` of the removal when
 * a trace was active, so the job continues it. The organization travels in the envelope of the
 * kit, from the transaction that enqueued it. A stored format: fields are only ever added, and a
 * reader accepts a payload without `traceparent`.
 */
interface CleanUpJobPayload {
  // #region Properties
  /** The account of the member who left. */
  readonly userId: string;

  /** The membership generation that ended. */
  readonly memberId: string;

  /** The `traceparent` of the delivery of the removal, absent without an active trace. */
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
 * Class JobsRemovedMemberCleanUpQueue
 *
 * @description
 * `RemovedMemberCleanUpQueue` on the `task.clean-up-removed-member` queue of `@cadenway/nest-jobs`,
 * bound to the tenant transaction of a unit of work: the job row is inserted through the
 * connection of that transaction, so it exists if and only if the transaction commits, and the kit
 * stores the organization of that transaction in its envelope, as it was spelled there. The
 * occurrence key is the membership and its version after the removal (`<memberId>:<version>`),
 * which the kit scopes to that organization: a redelivered or requeued removal enqueues nothing
 * more, while the removal of a later membership of the same account, which has its own member id
 * and can reach the same version, is a new occurrence.
 */
export class JobsRemovedMemberCleanUpQueue implements RemovedMemberCleanUpQueue {
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
   * Enqueues the clean-up of one removal once per membership and version, with the active
   * `traceparent`.
   *
   * @param {string} userId - The account of the member who left.
   * @param {string} memberId - The membership that ended.
   * @param {number} membershipVersion - Its version after the removal.
   * @returns {Promise<boolean>} `true` when a job was inserted, `false` for a duplicate.
   */
  public async enqueue(
    userId: string,
    memberId: string,
    membershipVersion: number,
  ): Promise<boolean> {
    const traceparent: string | undefined = activeTraceparent();
    const payload: CleanUpJobPayload =
      traceparent === undefined ? { userId, memberId } : { userId, memberId, traceparent };
    const result: JobEnqueueResult = await this.jobs.enqueue(
      this.transaction,
      CLEAN_UP_REMOVED_MEMBER_QUEUE,
      payload,
      { occurrenceKey: `${memberId}:${String(membershipVersion)}` },
    );
    return !result.duplicate;
  }

  /** Records one post-restore handover per source owner membership version. */
  public async enqueueOwnerHandover(memberId: string, membershipVersion: number): Promise<void> {
    await this.jobs.enqueue(
      this.transaction,
      CLEAN_UP_REMOVED_MEMBER_QUEUE,
      { kind: 'owner-handover' },
      { occurrenceKey: `owner:${memberId}:${String(membershipVersion)}` },
    );
  }
  // #endregion
}
